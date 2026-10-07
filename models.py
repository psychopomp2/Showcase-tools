"""Plain data records that move between pipeline stages."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class Driver:
    driver_id: str
    name: str
    phone: str
    email: str
    equipment: str
    capacity_lbs: int
    lat: float
    lon: float
    available_from: datetime
    preferred_max_miles: int | None = None
    documents: dict[str, "DocumentCheck"] = field(default_factory=dict)

    @property
    def documents_ok(self) -> bool:
        return bool(self.documents) and all(d.valid for d in self.documents.values())


@dataclass
class Load:
    load_id: str
    origin: str
    origin_lat: float
    origin_lon: float
    destination: str
    dest_lat: float
    dest_lon: float
    pickup_at: datetime
    weight_lbs: int
    equipment: str
    offered_rate: float | None = None   # what the customer offers, if known


@dataclass
class DocumentCheck:
    driver_id: str
    doc_type: str
    source: str
    expires_on: date | None
    valid: bool
    problems: list[str] = field(default_factory=list)


@dataclass
class Quote:
    loaded_miles: float
    empty_miles: float
    linehaul: float
    empty_charge: float
    total: float
    driver_pay: float
    margin: float

    @property
    def rate_per_mile(self) -> float:
        return self.total / self.loaded_miles if self.loaded_miles else 0.0


@dataclass
class Match:
    load: Load
    driver: Driver
    empty_miles: float
    score: float
    quote: Quote
    reasons: list[str] = field(default_factory=list)


@dataclass
class Rejection:
    load_id: str
    driver_id: str
    reasons: list[str]


@dataclass
class Notification:
    channel: str
    to: str
    subject: str
    body: str
    status: str            # "sent", "dry_run", "error"
    detail: str = ""
