"""
    notify(user, "traveler", "booking_accepted", "Ahmed accepted", "Pay within 2 hours…", {"booking_id": …})

Writes the in-app inbox row immediately and sends push after the surrounding
transaction commits (so a rolled-back booking never pings anyone).
"""
import logging

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Device, Notification

logger = logging.getLogger("goloc.push")
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def notify(user, role: str, kind: str, title: str, body: str, data: dict | None = None) -> Notification:
    payload = {k: str(v) for k, v in (data or {}).items()}
    note = Notification.objects.create(user=user, role=role, kind=kind, title=title[:120], body=body[:300], data=payload)
    transaction.on_commit(lambda: _enqueue_push(note.id))
    return note


def notify_admins(kind: str, title: str, body: str, data: dict | None = None):
    for admin in get_user_model().objects.filter(is_staff=True, is_active=True):
        notify(admin, "admin", kind, title, body, data)


def _enqueue_push(notification_id: int):
    from .tasks import send_push

    try:
        send_push.delay(notification_id)
    except Exception:  # noqa: BLE001 — broker down must never break the request
        logger.exception("Could not queue push %s", notification_id)


def deliver(notification: Notification):
    tokens = list(
        Device.objects.filter(user=notification.user, role=notification.role, is_active=True).values_list("expo_token", flat=True)
    )
    if not tokens:
        return 0
    messages = [
        {"to": t, "title": notification.title, "body": notification.body, "sound": "default",
         "data": {**notification.data, "kind": notification.kind, "notification_id": str(notification.id)},
         "priority": "high" if notification.kind.startswith("sos") else "default"}
        for t in tokens
    ]
    if settings.PUSH_PROVIDER != "expo":
        logger.info("[push:%s] %s → %d device(s): %s", settings.PUSH_PROVIDER, notification.user_id, len(tokens), notification.title)
        return len(tokens)
    resp = requests.post(EXPO_PUSH_URL, json=messages, timeout=10,
                         headers={"Accept": "application/json", "Content-Type": "application/json"})
    resp.raise_for_status()
    for token, ticket in zip(tokens, resp.json().get("data", [])):
        if ticket.get("status") == "error" and ticket.get("details", {}).get("error") == "DeviceNotRegistered":
            Device.objects.filter(expo_token=token).update(is_active=False)
    return len(tokens)
