"""Stage 6: audit trail in SQLite. Every run, assignment, rejection and
message is stored so a dispatcher can answer 'why did this driver get this
load?' after the fact."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .models import Match, Notification, Rejection

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, drivers INTEGER, loads INTEGER,
  assigned INTEGER, unassigned INTEGER, skipped_rows TEXT
);
CREATE TABLE IF NOT EXISTS assignments (
  run_id TEXT, load_id TEXT, driver_id TEXT, score REAL, empty_miles REAL, loaded_miles REAL,
  quote_total REAL, driver_pay REAL, margin REAL, reasons TEXT,
  PRIMARY KEY (run_id, load_id)
);
CREATE TABLE IF NOT EXISTS rejections (
  run_id TEXT, load_id TEXT, driver_id TEXT, reasons TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  run_id TEXT, driver_id TEXT, doc_type TEXT, source TEXT, expires_on TEXT, valid INTEGER, problems TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  run_id TEXT, channel TEXT, recipient TEXT, subject TEXT, status TEXT, detail TEXT
);
"""


class Store:
    def __init__(self, path: str | Path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path))
        self.conn.executescript(SCHEMA)

    def close(self):
        self.conn.commit()
        self.conn.close()

    def save_run(self, run_id, started_at, n_drivers, n_loads, assigned, unassigned, skipped):
        self.conn.execute("INSERT INTO runs VALUES (?,?,?,?,?,?,?)",
                          (run_id, started_at, n_drivers, n_loads, assigned, unassigned, json.dumps(skipped)))

    def save_assignments(self, run_id, matches: list[Match]):
        self.conn.executemany(
            "INSERT INTO assignments VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(run_id, m.load.load_id, m.driver.driver_id, m.score, m.empty_miles, m.quote.loaded_miles,
              m.quote.total, m.quote.driver_pay, m.quote.margin, json.dumps(m.reasons)) for m in matches])

    def save_rejections(self, run_id, rejections: list[Rejection]):
        self.conn.executemany("INSERT INTO rejections VALUES (?,?,?,?)",
                              [(run_id, r.load_id, r.driver_id, json.dumps(r.reasons)) for r in rejections])

    def save_documents(self, run_id, drivers):
        rows = []
        for d in drivers:
            for c in d.documents.values():
                rows.append((run_id, c.driver_id, c.doc_type, c.source,
                             c.expires_on.isoformat() if c.expires_on else None, int(c.valid), json.dumps(c.problems)))
        self.conn.executemany("INSERT INTO documents VALUES (?,?,?,?,?,?,?)", rows)

    def save_notifications(self, run_id, notes: list[Notification]):
        self.conn.executemany("INSERT INTO notifications VALUES (?,?,?,?,?,?)",
                              [(run_id, n.channel, n.to, n.subject, n.status, n.detail) for n in notes])

    def history(self, limit=10):
        return self.conn.execute(
            "SELECT run_id, started_at, drivers, loads, assigned, unassigned FROM runs ORDER BY started_at DESC LIMIT ?",
            (limit,)).fetchall()
