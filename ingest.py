"""Stage 1: read raw CSV exports (from a form, a spreadsheet or another
system), normalize fields, drop duplicates and report rows it had to skip."""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .models import Driver, Load


@dataclass
class IngestReport:
    accepted: int = 0
    skipped: list[str] = field(default_factory=list)


def clean_phone(raw: str) -> str:
    """Keeps digits; formats 10-digit numbers as 555-123-4567."""
    digits = re.sub(r"\D", "", str(raw or "").split(".")[0])
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return digits


def clean_email(raw: str) -> str:
    e = str(raw or "").strip().lower()
    return e if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", e) else ""


def clean_equipment(raw: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(raw or "").strip().lower())


def parse_dt(raw: str) -> datetime:
    raw = str(raw).strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%m/%d/%Y %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    raise ValueError(f"unrecognized date/time: {raw!r}")


def _rows(path: Path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for i, row in enumerate(csv.DictReader(fh), start=2):    # line 1 is the header
            yield i, {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}


def read_drivers(path: str | Path) -> tuple[list[Driver], IngestReport]:
    rep, seen, out = IngestReport(), set(), []
    for line, r in _rows(Path(path)):
        try:
            did = r["driver_id"]
            if not did:
                raise ValueError("missing driver_id")
            if did in seen:
                raise ValueError(f"duplicate driver_id {did}")
            d = Driver(
                driver_id=did,
                name=r["name"].title(),
                phone=clean_phone(r.get("phone", "")),
                email=clean_email(r.get("email", "")),
                equipment=clean_equipment(r["equipment"]),
                capacity_lbs=int(float(r["capacity_lbs"])),
                lat=float(r["lat"]),
                lon=float(r["lon"]),
                available_from=parse_dt(r["available_from"]),
                preferred_max_miles=int(r["preferred_max_miles"]) if r.get("preferred_max_miles") else None,
            )
            if not d.phone and not d.email:
                raise ValueError("no usable phone or email")
        except (KeyError, ValueError) as e:
            rep.skipped.append(f"{Path(path).name}:{line}: {e}")
            continue
        seen.add(did)
        out.append(d)
        rep.accepted += 1
    return out, rep


def read_loads(path: str | Path) -> tuple[list[Load], IngestReport]:
    rep, seen, out = IngestReport(), set(), []
    for line, r in _rows(Path(path)):
        try:
            lid = r["load_id"]
            if not lid or lid in seen:
                raise ValueError("missing or duplicate load_id")
            ld = Load(
                load_id=lid,
                origin=r["origin"], origin_lat=float(r["origin_lat"]), origin_lon=float(r["origin_lon"]),
                destination=r["destination"], dest_lat=float(r["dest_lat"]), dest_lon=float(r["dest_lon"]),
                pickup_at=parse_dt(r["pickup_at"]),
                weight_lbs=int(float(r["weight_lbs"])),
                equipment=clean_equipment(r["equipment"]),
                offered_rate=float(r["offered_rate"]) if r.get("offered_rate") else None,
            )
            if ld.weight_lbs <= 0:
                raise ValueError("weight must be positive")
        except (KeyError, ValueError) as e:
            rep.skipped.append(f"{Path(path).name}:{line}: {e}")
            continue
        seen.add(lid)
        out.append(ld)
        rep.accepted += 1
    return out, rep
