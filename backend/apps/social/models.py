import uuid

from django.conf import settings
from django.db import models

from apps.common.files import upload_to, validate_image


class Post(models.Model):
    """A Captain's reel or photo post. Feeds Discover → profile → Book (BR-9)."""

    class Kind(models.TextChoices):
        REEL = "reel", "Reel"
        PHOTO = "photo", "Photo"

    class Status(models.TextChoices):
        PUBLISHED = "published", "Published"
        HIDDEN = "hidden", "Hidden by moderation"
        DELETED = "deleted", "Deleted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="posts")
    city = models.ForeignKey("cities.City", on_delete=models.PROTECT, related_name="posts")
    kind = models.CharField(max_length=6, choices=Kind.choices)
    media = models.FileField(upload_to=upload_to("posts"))
    thumbnail = models.ImageField(upload_to=upload_to("thumbs"), validators=[validate_image], blank=True)
    caption = models.CharField(max_length=500, blank=True)
    service = models.ForeignKey("captains.ServiceOffer", null=True, blank=True, on_delete=models.SET_NULL,
                                help_text="Optional: the trip this post promotes.")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PUBLISHED)
    moderation_note = models.CharField(max_length=300, blank=True)

    like_count = models.PositiveIntegerField(default=0)
    view_count = models.PositiveIntegerField(default=0)
    profile_opens = models.PositiveIntegerField(default=0)
    booking_starts = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "city", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["captain", "status", "-created_at"]),
        ]


class PostLike(models.Model):
    id = models.BigAutoField(primary_key=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["post", "user"], name="unique_post_like")]
