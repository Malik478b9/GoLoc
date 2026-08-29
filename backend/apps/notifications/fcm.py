"""
Firebase Cloud Messaging wrapper (Section 5). Used for booking, chat, and
status-change push notifications across both mobile apps.
"""
import requests
from django.conf import settings

FCM_SEND_URL = "https://fcm.googleapis.com/fcm/send"


def send_push(token: str, title: str, body: str, data: dict | None = None) -> dict:
    headers = {
        "Authorization": f"key={settings.FCM_SERVER_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "to": token,
        "notification": {"title": title, "body": body},
        "data": data or {},
    }
    resp = requests.post(FCM_SEND_URL, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()


def notify_user(user, title: str, body: str, data: dict | None = None):
    for device in user.device_tokens.all():
        send_push(device.token, title, body, data)
