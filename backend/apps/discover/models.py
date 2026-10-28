from django.conf import settings
from django.db import models


class SavedTrip(models.Model):
    """A trip poster a traveler saved for later (a catalog spot key)."""

    id = models.BigAutoField(primary_key=True)
    traveler = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_trips")
    spot_key = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["traveler", "spot_key"], name="unique_saved_trip")]
