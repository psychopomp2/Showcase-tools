"""Command line: python -m dispatch_pipeline run --data sample_data --config config.example.toml"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime

from .config import load_settings
from .pipeline import run
from .store import Store


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="dispatch_pipeline", description="Driver-to-load dispatch pipeline (demo).")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="run the whole pipeline once")
    r.add_argument("--data", default="sample_data", help="folder with drivers.csv, loads.csv, documents/")
    r.add_argument("--config", default=None, help="TOML config (defaults are used if omitted)")
    r.add_argument("--today", default=None, help="YYYY-MM-DD, pins 'today' for document expiry checks")
    r.add_argument("--no-notify", action="store_true", help="skip the notification stage")

    h = sub.add_parser("history", help="list recent runs from the audit database")
    h.add_argument("--config", default=None)

    args = ap.parse_args(argv)
    settings = load_settings(args.config)

    if args.cmd == "history":
        s = Store(settings.db_path)
        for row in s.history():
            print("  ".join(str(x) for x in row))
        s.close()
        return 0

    today = date.fromisoformat(args.today) if args.today else None
    now = datetime.combine(today, datetime.now().time()) if today else None
    res = run(args.data, settings, today=today, now=now, notify=not args.no_notify)

    print(f"\nRun {res.run_id}: {len(res.assignments)} assigned, {len(res.unassigned)} unassigned, "
          f"{len(res.skipped_rows)} rows skipped, {len(res.warnings)} warnings")
    for a in res.assignments:
        print(f"  {a.load.load_id:<8} -> {a.driver.name:<18} score {a.score:.2f}  quote {a.quote.total:>9,.2f}")
    for lid in res.unassigned:
        print(f"  {lid:<8} -> no driver")
    sent = sum(n.status == "sent" for n in res.notifications)
    dry = sum(n.status == "dry_run" for n in res.notifications)
    err = sum(n.status == "error" for n in res.notifications)
    print(f"Messages: {sent} sent, {dry} dry-run, {err} errors (copies in {settings.notify.outbox_dir})")
    print(f"Report: {res.report_html}\nCSV:    {res.report_csv}\nAudit:  {settings.db_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
