import uuid

from django.db import models


class Reel(models.Model):
    """
    BR-9: Reels -> book funnel. Uploaded to Cloudflare Stream; this model
    stores the reference + engagement counters used on the Captain's
    'Insights' screen (Section 4.2).
    """

    class Status(models.TextChoices):
        UPLOADING = "uploading", "Uploading"
        PROCESSING = "processing", "Processing"
        LIVE = "live", "Live"
        REMOVED = "removed", "Removed (moderation)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="reels")
    cloudflare_stream_uid = models.CharField(max_length=64, blank=True)
    thumbnail_url = models.URLField(blank=True)
    caption = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UPLOADING)

    views_count = models.PositiveIntegerField(default=0)
    likes_count = models.PositiveIntegerField(default=0)
    profile_opens_count = models.PositiveIntegerField(default=0)
    booking_starts_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Reel by {self.captain.cap_id}"


class Post(models.Model):
    """Photo post on a Captain's Business Profile."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="posts")
    image_url = models.URLField(help_text="Cloudflare R2 public URL")
    caption = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
