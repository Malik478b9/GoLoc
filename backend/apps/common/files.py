"""
Upload validation and storage paths. Files go to MEDIA_ROOT locally and to
S3/R2 in production (see STORAGES in settings) — callers don't care which.
"""
import os
import uuid

from django.core.exceptions import ValidationError
from django.utils.deconstruct import deconstructible

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v"}
DOC_EXTS = IMAGE_EXTS | {".pdf"}

MB = 1024 * 1024


def _check(file, exts, max_mb, label):
    ext = os.path.splitext(file.name or "")[1].lower()
    if ext not in exts:
        raise ValidationError(f"{label} must be one of: {', '.join(sorted(exts))}.")
    if file.size > max_mb * MB:
        raise ValidationError(f"{label} must be under {max_mb} MB.")


def validate_image(file):
    _check(file, IMAGE_EXTS, 10, "Image")


def validate_video(file):
    _check(file, VIDEO_EXTS, 100, "Video")


def validate_document(file):
    _check(file, DOC_EXTS, 10, "Document")


@deconstructible
class upload_to:  # noqa: N801 — reads like the Django option it's passed to
    """Random names so uploads can't collide or be guessed from a person's name."""

    def __init__(self, folder):
        self.folder = folder

    def __call__(self, instance, filename):
        ext = os.path.splitext(filename)[1].lower()[:8]
        return f"{self.folder}/{uuid.uuid4().hex[:2]}/{uuid.uuid4().hex}{ext}"

    def __eq__(self, other):
        return isinstance(other, upload_to) and other.folder == self.folder


def private_storage():
    """KYC files. Callable so migrations don't freeze an environment-specific storage."""
    from django.core.files.storage import storages

    return storages["private"]


def absolute_media_url(request, field):
    if not field:
        return None
    url = field.url
    if url.startswith("http"):
        return url
    return request.build_absolute_uri(url) if request else url
