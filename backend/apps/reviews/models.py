import uuid

from django.conf import settings
from django.db import models


class Review(models.Model):
    """Traveler reviews a Captain post-trip (Section 3.1 Account / 4.1 Grow)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField("bookings.Booking", on_delete=models.CASCADE, related_name="review")
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="reviews")
    traveler = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    rating = models.PositiveSmallIntegerField(help_text="1-5")
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
