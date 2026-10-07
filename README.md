# Dispatch pipeline

A small, configurable pipeline that takes a list of drivers and a list of loads and decides who should haul what. Then it tells everyone and keeps a record of why.

```
drivers.csv ─┐
loads.csv  ──┼─> ingest ─> document checks ─> match ─> quote ─> notify ─> audit DB ─> HTML + CSV report
documents/ ──┘
```

It runs on the Python standard library alone (3.11+). OCR for scanned documents is optional.

All the data in `sample_data/` is invented, and every rate and threshold in `config.example.toml` is a placeholder. Nothing here reflects a real company's prices or rules.

## What each stage does

**Ingest** (`ingest.py`) reads CSV exports from a form or spreadsheet. It normalizes phone numbers, emails and equipment names, drops duplicate IDs and rows with no way to contact the driver, and reports every skipped row with its line number.

**Document checks** (`documents.py`) reads each driver's license, insurance and registration, pulls the expiry date out of the text and marks the document valid, expired, missing or expiring soon. Files are named `<driver_id>__<doc_type>.txt`. Text files work out of the box. Install the `ocr` extra and images are read with Tesseract. Any object with an `extract(path) -> str` method can replace the OCR engine.

**Match** (`matching.py`) applies hard rules first: same equipment, enough capacity, valid documents, pickup within the empty-miles limit, and the driver can reach pickup on time at an average speed. Pairs that pass get a weighted score from distance, offered rate per mile and the driver's preferred trip length. A greedy pass then gives each driver at most one load, best score first. Every rejected pair keeps its reasons.

**Quote** (`pricing.py`) is a transparent formula: base fee plus per-mile charges for loaded and empty miles, a minimum charge, and a driver share. Distances are straight-line miles times a road factor. Swap in a routing API if you need real road miles.

**Notify** (`notify.py`) renders an offer for each assigned driver and a summary for the dispatcher, then sends them through console, SMTP email or a webhook (Slack, Teams, a WhatsApp gateway). Dry-run is on by default: messages are written to `out/outbox/` and nothing leaves the machine. A failing channel is recorded and the others still go out.

**Audit** (`store.py`) writes runs, assignments, rejections with reasons, document results and messages to SQLite, so "why didn't this load get a driver?" has an answer later.

**Report** (`report.py`) writes a CSV of assignments and a self-contained HTML page with totals, assignments, every unassigned load with the reason each driver was ruled out, and a document status table.

## Run it

```
python -m dispatch_pipeline run --config config.example.toml --today 2026-10-07
python -m dispatch_pipeline history --config config.example.toml
```

`--today` pins the date used for document expiry so the sample gives the same result every time. With the sample data you get four assignments and three loads left open: one because the only nearby driver's insurance expired, one because the only driver in range is free a day late, and one because the flatbed driver is missing a registration.

To send real messages, set `dry_run = false`, pick channels, and put SMTP credentials in the environment variables named in the config. Credentials never go in the file.

## Tests

```
python -m unittest discover -s tests
```

Covers field cleaning, duplicate handling, expiry parsing, the distance and quote math, each hard rule, scoring order, one-load-per-driver assignment, config validation and a full run on the sample data with dry-run email and webhook channels.

## Limits

The assignment step is greedy, not optimal. For a few dozen loads it is fine and easy to explain. For larger boards, replace `assign()` with an assignment solver (the Hungarian algorithm, or OR-Tools) without touching the other stages. Distances are estimates, and the document parser only understands a few date formats after an "expires" or "valid until" label.
