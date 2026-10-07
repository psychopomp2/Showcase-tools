"""Stage 3: match drivers to loads.

Hard rules decide whether a pair is possible at all; a weighted score ranks
the possible pairs; a greedy pass then assigns each driver at most one load,
best score first.
"""
from __future__ import annotations

from datetime import timedelta

from .config import MatchingRules, PricingRules
from .models import Driver, Load, Match, Rejection
from .pricing import quote, road_miles


def evaluate(load: Load, driver: Driver, m: MatchingRules, p: PricingRules) -> Match | Rejection:
    reasons: list[str] = []

    if driver.equipment != load.equipment:
        reasons.append(f"equipment {driver.equipment} != {load.equipment}")
    if driver.capacity_lbs < load.weight_lbs:
        reasons.append(f"capacity {driver.capacity_lbs} < {load.weight_lbs} lbs")
    if not driver.documents_ok:
        bad = [f"{k}: {', '.join(v.problems)}" for k, v in driver.documents.items() if not v.valid]
        reasons.append("documents not valid (" + "; ".join(bad or ["not checked"]) + ")")

    empty = road_miles(driver.lat, driver.lon, load.origin_lat, load.origin_lon, p)
    if empty > m.max_empty_miles:
        reasons.append(f"{empty:.0f} empty miles > {m.max_empty_miles:.0f}")

    ready_at = driver.available_from + timedelta(hours=empty / m.avg_speed_mph)
    if ready_at > load.pickup_at:
        reasons.append(f"can reach pickup at {ready_at:%Y-%m-%d %H:%M}, after {load.pickup_at:%Y-%m-%d %H:%M}")

    if reasons:
        return Rejection(load.load_id, driver.driver_id, reasons)

    loaded = road_miles(load.origin_lat, load.origin_lon, load.dest_lat, load.dest_lon, p)
    q = quote(loaded, empty, p)

    s_distance = 1 - empty / m.max_empty_miles if m.max_empty_miles else 1.0
    notes = []
    if load.offered_rate is not None and loaded:
        s_rate = min(1.0, (load.offered_rate / loaded) / m.target_rate_per_mile)
        if load.offered_rate < q.total:
            notes.append(f"offer {load.offered_rate:.2f} is below quote {q.total:.2f}")
    else:
        s_rate = 0.5
        notes.append("no offered rate; neutral rate score")
    if driver.preferred_max_miles:
        over = max(0.0, loaded - driver.preferred_max_miles)
        s_pref = max(0.0, 1 - over / driver.preferred_max_miles)
    else:
        s_pref = 1.0

    score = round(m.weight_distance * s_distance + m.weight_rate * s_rate + m.weight_preference * s_pref, 4)
    notes.insert(0, f"distance {s_distance:.2f} · rate {s_rate:.2f} · preference {s_pref:.2f}")
    return Match(load, driver, empty, score, q, notes)


def assign(loads: list[Load], drivers: list[Driver], m: MatchingRules, p: PricingRules):
    """Returns (assignments, unassigned_load_ids, all_candidates, rejections)."""
    candidates: list[Match] = []
    rejections: list[Rejection] = []
    for ld in loads:
        for dr in drivers:
            r = evaluate(ld, dr, m, p)
            (candidates if isinstance(r, Match) else rejections).append(r)

    # Best score first; ties go to fewer empty miles, then IDs for determinism.
    candidates.sort(key=lambda x: (-x.score, x.empty_miles, x.load.load_id, x.driver.driver_id))
    used_drivers, used_loads, assignments = set(), set(), []
    for c in candidates:
        if c.driver.driver_id in used_drivers or c.load.load_id in used_loads:
            continue
        assignments.append(c)
        used_drivers.add(c.driver.driver_id)
        used_loads.add(c.load.load_id)

    unassigned = [ld.load_id for ld in loads if ld.load_id not in used_loads]
    return assignments, unassigned, candidates, rejections
