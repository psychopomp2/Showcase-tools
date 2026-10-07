"""Run with:  python -m unittest discover -s tests   (or: pytest)"""
import csv
import shutil
import sqlite3
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

from dispatch_pipeline.config import MatchingRules, PricingRules, Settings, load_settings
from dispatch_pipeline.documents import find_expiry
from dispatch_pipeline.ingest import clean_email, clean_phone, read_drivers
from dispatch_pipeline.matching import assign, evaluate
from dispatch_pipeline.models import DocumentCheck, Driver, Load, Match, Rejection
from dispatch_pipeline.pipeline import run
from dispatch_pipeline.pricing import haversine_miles, quote

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "sample_data"
TODAY = date(2026, 10, 7)


def driver(**kw):
    d = Driver(driver_id="D", name="Test Driver", phone="555-000-0000", email="", equipment="cargo_van",
               capacity_lbs=3000, lat=33.75, lon=-84.39, available_from=datetime(2026, 10, 8, 6))
    for k, v in kw.items():
        setattr(d, k, v)
    if not d.documents:
        d.documents = {"license": DocumentCheck(d.driver_id, "license", "x", date(2030, 1, 1), True)}
    return d


def load(**kw):
    ld = Load(load_id="L", origin="A", origin_lat=33.75, origin_lon=-84.39, destination="B",
              dest_lat=35.23, dest_lon=-80.84, pickup_at=datetime(2026, 10, 8, 10), weight_lbs=1000,
              equipment="cargo_van", offered_rate=900)
    for k, v in kw.items():
        setattr(ld, k, v)
    return ld


class Cleaning(unittest.TestCase):
    def test_phone(self):
        self.assertEqual(clean_phone("(555) 010-0001"), "555-010-0001")
        self.assertEqual(clean_phone("1 555 010 0001"), "555-010-0001")
        self.assertEqual(clean_phone("5550100003.0"), "555-010-0003")

    def test_email(self):
        self.assertEqual(clean_email(" Ana@Example.org "), "ana@example.org")
        self.assertEqual(clean_email("not-an-email"), "")

    def test_ingest_skips_bad_and_duplicate_rows(self):
        drivers, rep = read_drivers(SAMPLE / "drivers.csv")
        ids = [d.driver_id for d in drivers]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertNotIn("D007", ids)                      # no usable phone or email
        self.assertTrue(any("duplicate driver_id D002" in s for s in rep.skipped))
        self.assertEqual(next(d for d in drivers if d.driver_id == "D005").equipment, "cargo_van")


class Documents(unittest.TestCase):
    def test_expiry_formats(self):
        self.assertEqual(find_expiry("Expires: 2028-03-31"), date(2028, 3, 31))
        self.assertEqual(find_expiry("Valid until 12/31/2026"), date(2026, 12, 31))
        self.assertEqual(find_expiry("Exp. Date: 2027-06-30"), date(2027, 6, 30))
        self.assertIsNone(find_expiry("Issued 2020-01-01, no expiry printed"))


class Pricing(unittest.TestCase):
    def test_haversine_known_distance(self):
        # Atlanta -> Charlotte is roughly 226 straight-line miles.
        self.assertAlmostEqual(haversine_miles(33.749, -84.388, 35.227, -80.843), 226, delta=3)

    def test_quote_math_and_minimum(self):
        p = PricingRules(base_fee=100, per_loaded_mile=2, per_empty_mile=0.5, minimum_charge=250, driver_share=0.75)
        q = quote(200, 20, p)
        self.assertEqual(q.total, 510.0)
        self.assertEqual(q.driver_pay + q.margin, q.total)
        self.assertEqual(quote(10, 0, p).total, 250.0)


class Matching(unittest.TestCase):
    m, p = MatchingRules(max_empty_miles=150), PricingRules()

    def test_hard_rules(self):
        cases = {
            "equipment": driver(equipment="flatbed"),
            "capacity": driver(capacity_lbs=500),
            "documents": driver(documents={"license": DocumentCheck("D", "license", "", None, False, ["missing"])}),
            "empty miles": driver(lat=30.33, lon=-81.66),
            "reach pickup": driver(available_from=datetime(2026, 10, 9, 6)),
        }
        for label, d in cases.items():
            with self.subTest(label):
                r = evaluate(load(), d, self.m, self.p)
                self.assertIsInstance(r, Rejection)
                self.assertTrue(any(label.split()[0] in x for x in r.reasons), r.reasons)

    def test_closer_driver_scores_higher(self):
        near = evaluate(load(), driver(), self.m, self.p)
        far = evaluate(load(), driver(lat=34.3, lon=-84.9), self.m, self.p)
        self.assertIsInstance(near, Match)
        self.assertIsInstance(far, Match)
        self.assertGreater(near.score, far.score)

    def test_each_driver_gets_at_most_one_load(self):
        loads = [load(load_id="L1"), load(load_id="L2")]
        a, unassigned, _, _ = assign(loads, [driver()], self.m, self.p)
        self.assertEqual(len(a), 1)
        self.assertEqual(len(unassigned), 1)


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_sample_run(self):
        s = load_settings(ROOT / "config.example.toml")
        s.db_path = str(self.tmp / "audit.db")
        s.report_dir = str(self.tmp / "reports")
        s.notify.outbox_dir = str(self.tmp / "outbox")
        s.notify.channels = ["email", "webhook"]          # dry_run stays true: nothing is sent
        res = run(SAMPLE, s, today=TODAY, now=datetime(2026, 10, 7, 18))

        got = {a.load.load_id: a.driver.driver_id for a in res.assignments}
        self.assertEqual(got, {"L100": "D001", "L101": "D002", "L102": "D003", "L104": "D005"})
        self.assertEqual(sorted(res.unassigned), ["L103", "L105", "L106"])
        self.assertTrue(any("D005: registration expires" in w for w in res.warnings))

        self.assertTrue(res.notifications)
        self.assertTrue(all(n.status == "dry_run" for n in res.notifications))
        self.assertEqual(len(list((self.tmp / "outbox").iterdir())), len(res.notifications))

        db = sqlite3.connect(s.db_path)
        self.assertEqual(db.execute("select count(*) from assignments").fetchone()[0], 4)
        reasons = db.execute("select reasons from rejections where load_id='L106' and driver_id='D006'").fetchone()[0]
        self.assertIn("registration: missing", reasons)
        db.close()

        with open(res.report_csv, newline="") as fh:
            rows = list(csv.DictReader(fh))
        self.assertEqual(len(rows), 4)
        self.assertIn("Unassigned loads and why", res.report_html.read_text())

    def test_bad_weights_rejected(self):
        cfg = self.tmp / "bad.toml"
        cfg.write_text("[matching]\nweight_distance = 0.9\nweight_rate = 0.3\nweight_preference = 0.2\n")
        with self.assertRaises(ValueError):
            load_settings(cfg)


if __name__ == "__main__":
    unittest.main()
