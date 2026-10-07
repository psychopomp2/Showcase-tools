"""Loads the TOML config into typed settings.

Every number in config.example.toml is a placeholder chosen for the demo.
None of it is a real company's pricing or dispatch policy.
"""
from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class MatchingRules:
    max_empty_miles: float = 100.0
    avg_speed_mph: float = 50.0            # used to check a driver can reach pickup on time
    weight_distance: float = 0.5
    weight_rate: float = 0.3
    weight_preference: float = 0.2
    target_rate_per_mile: float = 2.0


@dataclass
class PricingRules:
    base_fee: float = 100.0
    per_loaded_mile: float = 2.0
    per_empty_mile: float = 0.5
    minimum_charge: float = 250.0
    driver_share: float = 0.75             # share of the total paid to the driver
    road_factor: float = 1.18              # straight-line miles -> road miles estimate


@dataclass
class DocumentRules:
    required: list[str] = field(default_factory=lambda: ["license", "insurance", "registration"])
    warn_days_before_expiry: int = 30


@dataclass
class NotifyRules:
    dry_run: bool = True
    channels: list[str] = field(default_factory=lambda: ["console"])
    outbox_dir: str = "out/outbox"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user_env: str = "DISPATCH_SMTP_USER"
    smtp_password_env: str = "DISPATCH_SMTP_PASSWORD"
    from_address: str = "dispatch@example.org"
    webhook_url: str = ""
    dispatcher_email: str = "dispatcher@example.org"


@dataclass
class Settings:
    matching: MatchingRules = field(default_factory=MatchingRules)
    pricing: PricingRules = field(default_factory=PricingRules)
    documents: DocumentRules = field(default_factory=DocumentRules)
    notify: NotifyRules = field(default_factory=NotifyRules)
    db_path: str = "out/dispatch.db"
    report_dir: str = "out/reports"
    company_name: str = "Example Dispatch Co."


def _section(cls, data: dict):
    known = {f for f in cls.__dataclass_fields__}
    unknown = set(data) - known
    if unknown:
        raise ValueError(f"Unknown keys in [{cls.__name__}]: {', '.join(sorted(unknown))}")
    return cls(**data)


def load_settings(path: str | Path | None) -> Settings:
    if path is None:
        return Settings()
    with open(path, "rb") as fh:
        raw = tomllib.load(fh)
    general = raw.get("general", {})
    s = Settings(
        matching=_section(MatchingRules, raw.get("matching", {})),
        pricing=_section(PricingRules, raw.get("pricing", {})),
        documents=_section(DocumentRules, raw.get("documents", {})),
        notify=_section(NotifyRules, raw.get("notify", {})),
        db_path=general.get("db_path", Settings.db_path),
        report_dir=general.get("report_dir", Settings.report_dir),
        company_name=general.get("company_name", Settings.company_name),
    )
    m = s.matching
    total = m.weight_distance + m.weight_rate + m.weight_preference
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"matching weights must add up to 1.0 (got {total:.3f})")
    if not 0 < s.pricing.driver_share <= 1:
        raise ValueError("pricing.driver_share must be in (0, 1]")
    return s
