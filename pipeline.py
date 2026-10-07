"""Runs every stage in order and returns a summary of what happened.

    ingest -> documents -> match -> quote -> notify -> store -> report
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from .config import Settings
from .documents import check_documents
from .ingest import read_drivers, read_loads
from .matching import assign
from .models import Match, Notification
from .notify import Notifier
from .report import write_csv, write_html
from .store import Store


@dataclass
class RunResult:
    run_id: str
    assignments: list[Match]
    unassigned: list[str]
    skipped_rows: list[str]
    warnings: list[str]
    notifications: list[Notification] = field(default_factory=list)
    report_html: Path | None = None
    report_csv: Path | None = None


def run(data_dir: str | Path, settings: Settings, today: date | None = None,
        now: datetime | None = None, notify: bool = True) -> RunResult:
    data_dir = Path(data_dir)
    now = now or datetime.now()
    run_id = now.strftime("%Y%m%d-%H%M%S")

    # 1. ingest
    drivers, rep_d = read_drivers(data_dir / "drivers.csv")
    loads, rep_l = read_loads(data_dir / "loads.csv")
    skipped = rep_d.skipped + rep_l.skipped

    # 2. documents
    warnings = check_documents(drivers, data_dir / "documents", settings.documents, today=today)

    # 3 + 4. match and quote
    assignments, unassigned, _candidates, rejections = assign(loads, drivers, settings.matching, settings.pricing)

    # 5. notify
    notes: list[Notification] = []
    if notify:
        notifier = Notifier(settings.notify, settings.company_name)
        for a in assignments:
            notes += notifier.offer(a)
        notes += notifier.summary(run_id, assignments, unassigned, len(rep_d.skipped))

    # 6. store
    store = Store(settings.db_path)
    try:
        store.save_run(run_id, now.isoformat(timespec="seconds"), len(drivers), len(loads),
                       len(assignments), len(unassigned), skipped)
        store.save_assignments(run_id, assignments)
        store.save_rejections(run_id, rejections)
        store.save_documents(run_id, drivers)
        store.save_notifications(run_id, notes)
    finally:
        store.close()

    # 7. report
    out = Path(settings.report_dir)
    out.mkdir(parents=True, exist_ok=True)
    html_path = write_html(out / f"run-{run_id}.html", run_id, settings.company_name, assignments, unassigned,
                           rejections, drivers, warnings, skipped)
    csv_path = write_csv(out / f"run-{run_id}.csv", assignments)

    return RunResult(run_id, assignments, unassigned, skipped, warnings, notes, html_path, csv_path)
