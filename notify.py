"""Stage 5: tell people.

Messages are rendered from templates and sent through pluggable channels.
Dry-run is the default: every message is written to the outbox folder and
logged, nothing leaves the machine. Turn it off in config to send for real.
"""
from __future__ import annotations

import json
import os
import smtplib
import urllib.request
from email.message import EmailMessage
from pathlib import Path
from string import Template

from .config import NotifyRules
from .models import Match, Notification

OFFER_TEMPLATE = Template(
    "Hi $first_name,\n\n"
    "Load $load_id is available for you:\n"
    "  Pickup:   $origin, $pickup\n"
    "  Delivery: $destination\n"
    "  Miles:    $loaded_miles loaded, $empty_miles empty to pickup\n"
    "  Pay:      $$$driver_pay\n\n"
    "Reply YES to accept or NO to pass.\n"
    "$company"
)

SUMMARY_TEMPLATE = Template(
    "Dispatch run $run_id\n\n"
    "Assigned: $assigned   Unassigned: $unassigned   Drivers skipped at intake: $skipped\n\n"
    "$lines\n"
)


def render_offer(match: Match, company: str) -> tuple[str, str]:
    d, ld, q = match.driver, match.load, match.quote
    body = OFFER_TEMPLATE.substitute(
        first_name=d.name.split()[0], load_id=ld.load_id,
        origin=ld.origin, pickup=f"{ld.pickup_at:%a %b %d %H:%M}", destination=ld.destination,
        loaded_miles=f"{q.loaded_miles:.0f}", empty_miles=f"{q.empty_miles:.0f}",
        driver_pay=f"{q.driver_pay:,.2f}", company=company,
    )
    return f"Load offer {ld.load_id}: {ld.origin} -> {ld.destination}", body


class Outbox:
    def __init__(self, folder: str | Path):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)
        self.n = 0

    def write(self, n: Notification) -> Path:
        self.n += 1
        safe_to = "".join(ch if ch.isalnum() else "_" for ch in n.to)[:40]
        path = self.folder / f"{self.n:03d}_{n.channel}_{safe_to}.txt"
        path.write_text(f"To: {n.to}\nSubject: {n.subject}\nStatus: {n.status}\n\n{n.body}", encoding="utf-8")
        return path


class Notifier:
    def __init__(self, rules: NotifyRules, company: str):
        self.rules, self.company = rules, company
        self.outbox = Outbox(rules.outbox_dir)

    # --- channels -------------------------------------------------------------
    def _console(self, to, subject, body):
        print(f"\n--- message to {to} ---\n{subject}\n{body}\n")

    def _email(self, to, subject, body):
        r = self.rules
        if not r.smtp_host:
            raise RuntimeError("smtp_host is not configured")
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = r.from_address, to, subject
        msg.set_content(body)
        with smtplib.SMTP(r.smtp_host, r.smtp_port, timeout=20) as s:
            s.starttls()
            user, pw = os.environ.get(r.smtp_user_env), os.environ.get(r.smtp_password_env)
            if user and pw:
                s.login(user, pw)
            s.send_message(msg)

    def _webhook(self, to, subject, body):
        if not self.rules.webhook_url:
            raise RuntimeError("webhook_url is not configured")
        data = json.dumps({"to": to, "subject": subject, "text": body}).encode()
        req = urllib.request.Request(self.rules.webhook_url, data=data,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status >= 300:
                raise RuntimeError(f"webhook returned {resp.status}")

    # --- public -----------------------------------------------------------------
    def send(self, to: str, subject: str, body: str) -> list[Notification]:
        out = []
        for ch in self.rules.channels:
            if self.rules.dry_run and ch != "console":      # console never leaves the machine
                n = Notification(ch, to, subject, body, "dry_run")
            else:
                try:
                    {"console": self._console, "email": self._email, "webhook": self._webhook}[ch](to, subject, body)
                    n = Notification(ch, to, subject, body, "sent")
                except KeyError:
                    n = Notification(ch, to, subject, body, "error", f"unknown channel {ch}")
                except Exception as e:      # one bad channel must not stop the others
                    n = Notification(ch, to, subject, body, "error", str(e))
            self.outbox.write(n)
            out.append(n)
        return out

    def offer(self, match: Match) -> list[Notification]:
        subject, body = render_offer(match, self.company)
        to = match.driver.email or match.driver.phone
        return self.send(to, subject, body)

    def summary(self, run_id: str, assignments: list[Match], unassigned: list[str], skipped: int) -> list[Notification]:
        lines = [f"  {a.load.load_id} -> {a.driver.name} ({a.driver.driver_id}), "
                 f"score {a.score:.2f}, quote {a.quote.total:,.2f}" for a in assignments]
        lines += [f"  {lid} -> NO DRIVER" for lid in unassigned]
        body = SUMMARY_TEMPLATE.substitute(run_id=run_id, assigned=len(assignments), unassigned=len(unassigned),
                                           skipped=skipped, lines="\n".join(lines) or "  (no loads)")
        return self.send(self.rules.dispatcher_email, f"Dispatch summary {run_id}", body)
