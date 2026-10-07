"""Stage 4: quote a load for a given driver position.

A deliberately simple, transparent formula so every number in a quote can be
traced back to config. Replace it with your own model.
"""
from __future__ import annotations

import math

from .config import PricingRules
from .models import Quote

EARTH_RADIUS_MI = 3958.8


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(a))


def road_miles(lat1, lon1, lat2, lon2, rules: PricingRules) -> float:
    """Straight-line distance times a road factor. Use a routing API for real miles."""
    return round(haversine_miles(lat1, lon1, lat2, lon2) * rules.road_factor, 1)


def quote(loaded_miles: float, empty_miles: float, rules: PricingRules) -> Quote:
    linehaul = rules.base_fee + rules.per_loaded_mile * loaded_miles
    empty = rules.per_empty_mile * empty_miles
    total = round(max(rules.minimum_charge, linehaul + empty), 2)
    driver_pay = round(total * rules.driver_share, 2)
    return Quote(
        loaded_miles=loaded_miles, empty_miles=empty_miles,
        linehaul=round(linehaul, 2), empty_charge=round(empty, 2),
        total=total, driver_pay=driver_pay, margin=round(total - driver_pay, 2),
    )
