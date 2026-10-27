import secrets
import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


def _share_token():
    return secrets.token_urlsafe(12)


class Itinerary(models.Model):
    """
    A trip plan a Captain prepares, drafted by AI and finished by hand.

      template — a default itinerary for one of their trips (usually a package or
                 guide service). Published templates show on the public profile.
      custom   — prepared for one traveler's booking: starts from a template (or
                 blank) and is adjusted to their dates, comfort level and requests.
                 Published = shared with that traveler.

    `inputs` holds what the Captain fills in by hand (hotel names they actually
    use, must-see places, vehicle…); the AI keeps those exactly and fills the rest.
    `content` is the detailed document, `poster` the one-glance summary.
    """

    class Kind(models.TextChoices):
        TEMPLATE = "template", "Default itinerary"
        CUSTOM = "custom", "Custom for a traveler"

    class Tier(models.TextChoices):
        STANDARD = "standard", "Standard"
        NORMAL = "normal", "Normal"
        MEDIUM = "medium", "Medium"
        LAVISH = "lavish", "Lavish"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        GENERATING = "generating", "AI is writing"
        READY = "ready", "Ready"
        FAILED = "failed", "Couldn't generate"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=16, unique=True, help_text="Public ID, e.g. ITN-1001.")
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="itineraries")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.TEMPLATE)
    based_on = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="copies")
    service = models.ForeignKey("captains.ServiceOffer", null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="itineraries")
    booking = models.ForeignKey("bookings.Booking", null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="itineraries")

    title = models.CharField(max_length=140)
    destination = models.CharField(max_length=200, help_text="Places covered, e.g. Leh · Nubra · Pangong.")
    tier = models.CharField(max_length=10, choices=Tier.choices, default=Tier.MEDIUM)
    days = models.PositiveSmallIntegerField(default=3, validators=[MinValueValidator(1), MaxValueValidator(30)])
    guests = models.PositiveSmallIntegerField(default=2, validators=[MinValueValidator(1), MaxValueValidator(20)])
    start_date = models.DateField(null=True, blank=True, help_text="Arrival day (custom itineraries).")
    end_date = models.DateField(null=True, blank=True, help_text="Departure day (custom itineraries).")
    arrival = models.JSONField(default=dict, blank=True, help_text='{"mode", "point", "time", "reference"}')
    departure = models.JSONField(default=dict, blank=True, help_text='{"mode", "point", "time", "reference"}')
    inputs = models.JSONField(default=dict, blank=True, help_text="What the Captain filled in by hand.")
    requests = models.TextField(max_length=2000, blank=True, help_text="The traveler's requests, in their words.")

    content = models.JSONField(default=dict, blank=True, help_text="The detailed itinerary document.")
    poster = models.JSONField(default=dict, blank=True, help_text="The brief poster.")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    error = models.CharField(max_length=300, blank=True)
    ai_model = models.CharField(max_length=40, blank=True)
    generated_at = models.DateTimeField(null=True, blank=True)
    edited_by_hand = models.BooleanField(default=False)

    is_published = models.BooleanField(default=False)
    share_token = models.CharField(max_length=24, unique=True, default=_share_token)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["captain", "kind", "-updated_at"]),
            models.Index(fields=["captain", "kind", "is_published"]),
        ]

    def __str__(self):
        return f"{self.code} {self.title}"
