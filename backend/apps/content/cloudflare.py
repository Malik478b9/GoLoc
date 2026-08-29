"""
Cloudflare Stream (reels) + R2 (public images) helpers (Section 5).

Stream flow: backend requests a direct-upload URL, the mobile app uploads
straight to Cloudflare (never through our API servers), and Cloudflare
calls our webhook when transcoding finishes.
"""
import requests
from django.conf import settings

STREAM_API_BASE = "https://api.cloudflare.com/client/v4/accounts/{account_id}/stream"


def _headers():
    return {"Authorization": f"Bearer {settings.CLOUDFLARE_STREAM_API_TOKEN}"}


def create_direct_upload_url(max_duration_seconds: int = 120) -> dict:
    """Returns {"uploadURL": ..., "uid": ...} for the mobile app to PUT the video to."""
    url = f"{STREAM_API_BASE.format(account_id=settings.CLOUDFLARE_ACCOUNT_ID)}/direct_upload"
    resp = requests.post(
        url, headers=_headers(), json={"maxDurationSeconds": max_duration_seconds}
    )
    resp.raise_for_status()
    return resp.json()["result"]


def get_video_status(uid: str) -> dict:
    url = f"{STREAM_API_BASE.format(account_id=settings.CLOUDFLARE_ACCOUNT_ID)}/{uid}"
    resp = requests.get(url, headers=_headers())
    resp.raise_for_status()
    return resp.json()["result"]


def playback_url(uid: str) -> str:
    return f"https://customer-{settings.CLOUDFLARE_ACCOUNT_ID}.cloudflarestream.com/{uid}/manifest/video.m3u8"


def thumbnail_url(uid: str) -> str:
    return f"https://customer-{settings.CLOUDFLARE_ACCOUNT_ID}.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg"
