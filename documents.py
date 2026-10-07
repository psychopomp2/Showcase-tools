"""Stage 2: driver document checks.

Each file in the documents folder is one document, named
``<driver_id>__<doc_type>.<ext>``. Text is pulled out by an OCR engine, then
parsed for an expiry date. The default engine reads .txt files (e.g. text a
scanner already extracted). If pytesseract and Pillow are installed, images
are OCR'd too. Swap in any engine with an ``extract(path) -> str`` method.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Protocol

from .config import DocumentRules
from .models import DocumentCheck, Driver

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}


class OcrEngine(Protocol):
    def extract(self, path: Path) -> str: ...


class TextEngine:
    """Reads text files; for images it uses Tesseract when available."""

    def __init__(self):
        try:
            import pytesseract  # noqa: F401
            from PIL import Image  # noqa: F401
            self._ocr = True
        except ImportError:
            self._ocr = False

    def extract(self, path: Path) -> str:
        if path.suffix.lower() == ".txt":
            return path.read_text(encoding="utf-8", errors="replace")
        if path.suffix.lower() in IMAGE_EXT:
            if not self._ocr:
                raise RuntimeError("image document but pytesseract/Pillow are not installed")
            import pytesseract
            from PIL import Image
            return pytesseract.image_to_string(Image.open(path))
        raise RuntimeError(f"unsupported document type: {path.suffix}")


_DATE_PATTERNS = [
    (re.compile(r"(\d{4})-(\d{2})-(\d{2})"), "%Y-%m-%d"),
    (re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})"), "%m/%d/%Y"),
]
_EXPIRY_LABEL = re.compile(r"(exp(?:ires|iration|\.)?|valid\s+(?:until|thru|through))\s*(?:date)?\s*[:\-]?\s*", re.I)


def find_expiry(text: str) -> date | None:
    """Returns the date that follows an 'expires'/'valid until' label, if any."""
    for m in _EXPIRY_LABEL.finditer(text):
        tail = text[m.end(): m.end() + 30]
        for rx, fmt in _DATE_PATTERNS:
            d = rx.search(tail)
            if d and d.start() < 5:
                try:
                    return datetime.strptime(d.group(0), fmt).date()
                except ValueError:
                    pass
    return None


def check_documents(drivers: list[Driver], folder: str | Path, rules: DocumentRules,
                    today: date | None = None, engine: OcrEngine | None = None) -> list[str]:
    """Attaches a DocumentCheck per required doc type to each driver.
    Returns human-readable warnings (expiring soon, unreadable files...)."""
    today = today or date.today()
    engine = engine or TextEngine()
    folder = Path(folder)
    warnings: list[str] = []
    by_driver: dict[str, dict[str, Path]] = {}
    if folder.exists():
        for p in sorted(folder.iterdir()):
            if "__" in p.stem:
                did, dtype = p.stem.split("__", 1)
                by_driver.setdefault(did, {})[dtype.lower()] = p

    for d in drivers:
        files = by_driver.get(d.driver_id, {})
        for dtype in rules.required:
            path = files.get(dtype)
            if path is None:
                d.documents[dtype] = DocumentCheck(d.driver_id, dtype, "", None, False, ["missing"])
                continue
            problems: list[str] = []
            try:
                exp = find_expiry(engine.extract(path))
            except RuntimeError as e:
                exp, problems = None, [str(e)]
            if exp is None and not problems:
                problems.append("no expiry date found")
            elif exp is not None and exp < today:
                problems.append(f"expired {exp.isoformat()}")
            elif exp is not None and (exp - today).days <= rules.warn_days_before_expiry:
                warnings.append(f"{d.driver_id}: {dtype} expires {exp.isoformat()}")
            d.documents[dtype] = DocumentCheck(d.driver_id, dtype, path.name, exp, not problems, problems)
    return warnings
