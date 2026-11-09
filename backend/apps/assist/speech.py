"""
Voice to text, so Captains can speak instead of type, in their own language.

Uses Groq's Whisper (whisper-large-v3), which handles Hindi, Telugu, Tamil,
Kannada, Malayalam, Marathi, Bengali, Gujarati and English. Needs GROQ_API_KEY.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger("goloc.ai")

URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MODEL = "whisper-large-v3"
MAX_BYTES = 15 * 1024 * 1024


class SpeechError(Exception):
    pass


def enabled() -> bool:
    return bool(settings.GROQ_API_KEY)


def transcribe(upload, language: str = "") -> str:
    if not enabled():
        raise SpeechError("Voice typing isn't set up on this server yet.")
    if upload.size > MAX_BYTES:
        raise SpeechError("That recording is too long. Keep it under 5 minutes.")
    data = {"model": MODEL, "response_format": "json", "temperature": "0"}
    if language and language != "auto":
        data["language"] = language
    try:
        r = requests.post(
            URL,
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            data=data,
            files={"file": (upload.name or "voice.m4a", upload.read(), upload.content_type or "audio/m4a")},
            timeout=60,
        )
    except requests.RequestException as exc:
        logger.warning("Transcription failed: %s", exc)
        raise SpeechError("Couldn't reach the voice service. Try again.") from exc
    if r.status_code != 200:
        logger.warning("Transcription HTTP %s: %s", r.status_code, r.text[:300])
        raise SpeechError("Couldn't understand that recording. Try again, a little closer to the phone.")
    return (r.json().get("text") or "").strip()
