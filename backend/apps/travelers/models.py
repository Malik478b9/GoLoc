import uuid

from django.conf import settings
from django.db import models


class TravelerProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="traveler_profile"
    )
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Traveler · {self.user.full_name or self.user.phone_number}"


class SavedCaptain(models.Model):
    """Account > Saved Captains (Section 3.1)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    traveler = models.ForeignKey(TravelerProfile, on_delete=models.CASCADE, related_name="saved_captains")
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["traveler", "captain"]
