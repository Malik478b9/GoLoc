import uuid

from django.conf import settings
from django.db import models


class Incident(models.Model):
    """Admin > Trust/Growth > Incidents (Section 2.3) — SOS escalations, safety events."""

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        INVESTIGATING = "investigating", "Investigating"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.CASCADE, related_name="incidents")
    sos_alert = models.ForeignKey(
        "safety.SOSAlert", on_delete=models.SET_NULL, null=True, blank=True, related_name="incidents"
    )
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.MEDIUM)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    summary = models.TextField()
    assigned_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_incidents"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class Dispute(models.Model):
    """Admin > Ops/Finance-adjacent Disputes (Section 2.3), e.g. refund disagreements."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED_TRAVELER = "resolved_traveler", "Resolved in Traveler's favor"
        RESOLVED_CAPTAIN = "resolved_captain", "Resolved in Captain's favor"
        RESOLVED_SPLIT = "resolved_split", "Resolved — split"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.CASCADE, related_name="disputes")
    raised_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    resolution_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class AuditLog(models.Model):
    """Admin > Platform > Audit (Section 2.3) — append-only trail of admin actions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=50, help_text="e.g. Booking, CaptainProfile")
    target_id = models.CharField(max_length=64)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["target_type", "target_id"])]


class Promotion(models.Model):
    """Admin > Trust/Growth > Promotions — sponsored/featured placement (revenue stream R3-R8)."""

    class PromotionType(models.TextChoices):
        SPONSORED = "sponsored", "Sponsored Captain"
        FEATURED = "featured", "Featured listing"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="promotions")
    promotion_type = models.CharField(max_length=16, choices=PromotionType.choices)
    city = models.ForeignKey("cities.City", on_delete=models.CASCADE)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
