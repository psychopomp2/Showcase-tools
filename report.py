"""Stage 7: a CSV and a self-contained HTML report for each run."""
from __future__ import annotations

import csv
import html
from pathlib import Path

from .models import Driver, Match, Rejection


def write_csv(path: Path, assignments: list[Match]) -> Path:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["load_id", "driver_id", "driver", "origin", "destination", "pickup_at",
                    "empty_miles", "loaded_miles", "quote_total", "driver_pay", "margin", "score"])
        for a in assignments:
            q = a.quote
            w.writerow([a.load.load_id, a.driver.driver_id, a.driver.name, a.load.origin, a.load.destination,
                        a.load.pickup_at.isoformat(timespec="minutes"), f"{a.empty_miles:.1f}",
                        f"{q.loaded_miles:.1f}", f"{q.total:.2f}", f"{q.driver_pay:.2f}", f"{q.margin:.2f}", a.score])
    return path


def write_html(path: Path, run_id: str, company: str, assignments: list[Match], unassigned: list[str],
               rejections: list[Rejection], drivers: list[Driver], warnings: list[str], skipped: list[str]) -> Path:
    e = html.escape
    total = sum(a.quote.total for a in assignments)
    margin = sum(a.quote.margin for a in assignments)

    rows = "".join(
        f"<tr><td>{e(a.load.load_id)}</td><td>{e(a.load.origin)} → {e(a.load.destination)}</td>"
        f"<td>{e(a.driver.name)}</td><td class=n>{a.empty_miles:.0f}</td><td class=n>{a.quote.loaded_miles:.0f}</td>"
        f"<td class=n>{a.quote.total:,.2f}</td><td class=n>{a.score:.2f}</td><td>{e(a.reasons[0])}</td></tr>"
        for a in assignments)

    why_not: dict[str, list[str]] = {}
    for r in rejections:
        if r.load_id in unassigned:
            why_not.setdefault(r.load_id, []).append(f"{r.driver_id}: {'; '.join(r.reasons)}")
    unassigned_html = "".join(
        f"<li><b>{e(lid)}</b><ul>{''.join(f'<li>{e(x)}</li>' for x in why_not.get(lid, ['every eligible driver was used']))}</ul></li>"
        for lid in unassigned) or "<li>None</li>"

    docs = "".join(
        f"<tr><td>{e(d.driver_id)}</td><td>{e(d.name)}</td>" +
        "".join(f"<td class={'ok' if c.valid else 'bad'}>{e(c.doc_type)}: "
                f"{e(c.expires_on.isoformat() if c.expires_on else ', '.join(c.problems))}</td>"
                for c in d.documents.values()) + "</tr>"
        for d in drivers)

    notes = "".join(f"<li>{e(x)}</li>" for x in warnings + skipped) or "<li>None</li>"

    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Dispatch run {e(run_id)}</title>
<style>
:root{{--ink:#1f2328;--soft:#59636e;--line:#d1d9e0;--bg:#fff;--ok:#1a7f37;--bad:#cf222e;--accent:#0969da}}
@media (prefers-color-scheme: dark){{:root{{--ink:#e6edf3;--soft:#9198a1;--line:#3d444d;--bg:#0d1117;--ok:#3fb950;--bad:#f85149;--accent:#4493f8}}}}
body{{font:15px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--bg);margin:0;padding:24px 16px;max-width:1100px;margin-inline:auto}}
h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:17px;margin:28px 0 8px}} .sub{{color:var(--soft)}}
.kpis{{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}} .kpi{{border:1px solid var(--line);border-radius:8px;padding:10px 14px;min-width:120px}}
.kpi b{{display:block;font-size:22px}} .wrap{{overflow-x:auto}}
table{{border-collapse:collapse;width:100%;font-size:14px}} th,td{{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}}
th{{color:var(--soft);font-weight:600;font-size:12px;text-transform:uppercase}} td.n{{text-align:right;font-variant-numeric:tabular-nums}}
.ok{{color:var(--ok)}} .bad{{color:var(--bad)}}
</style></head><body>
<h1>{e(company)} · dispatch run</h1><div class="sub">Run {e(run_id)} · demo data</div>
<div class="kpis">
<div class="kpi">Assigned<b>{len(assignments)}</b></div>
<div class="kpi">Unassigned<b>{len(unassigned)}</b></div>
<div class="kpi">Quoted total<b>{total:,.0f}</b></div>
<div class="kpi">Margin<b>{margin:,.0f}</b></div>
</div>
<h2>Assignments</h2><div class="wrap"><table><tr><th>Load</th><th>Lane</th><th>Driver</th><th>Empty mi</th><th>Loaded mi</th><th>Quote</th><th>Score</th><th>Score parts</th></tr>{rows}</table></div>
<h2>Unassigned loads and why</h2><ul>{unassigned_html}</ul>
<h2>Driver documents</h2><div class="wrap"><table>{docs}</table></div>
<h2>Warnings and skipped rows</h2><ul>{notes}</ul>
</body></html>"""
    path.write_text(page, encoding="utf-8")
    return path
