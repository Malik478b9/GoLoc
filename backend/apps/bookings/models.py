import secrets
import uuid
from datetime import datetime, time

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


def _share_token():
    return secrets.token_urlsafe(16)


class Booking(models.Model):
    """
    requested ──accept──▶ accepted ──pay──▶ confirmed ──start(PIN)──▶ in_progress ──complete──▶ completed
        │ decline/expire     │ expire/cancel     │ cancel (refund per BR-4)
        ▼                    ▼                   ▼
     declined/expired     expired/cancelled   cancelled
    """

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        ACCEPTED = "accepted", "Accepted · awaiting payment"
        CONFIRMED = "confirmed", "Confirmed"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    class Tier(models.TextChoices):
        STANDARD = "standard", "Standard"  # day experiences have one price
        NORMAL = "normal", "Normal"
        MEDIUM = "medium", "Medium"
        LAVISH = "lavish", "Lavish"

    ACTIVE = (Status.REQUESTED, Status.ACCEPTED, Status.CONFIRMED, Status.IN_PROGRESS)
    PAID = (Status.CONFIRMED, Status.IN_PROGRESS, Status.COMPLETED)
    # Statuses that hold one of the Captain's daily slots.
    HOLDS_SLOT = (Status.ACCEPTED, Status.CONFIRMED, Status.IN_PROGRESS)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=16, unique=True, help_text="Public ID, e.g. BKG-8001.")
    traveler = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bookings")
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.PROTECT, related_name="bookings")
    service = models.ForeignKey("captains.ServiceOffer", on_delete=models.PROTECT, related_name="bookings")
    city = models.ForeignKey("cities.City", on_delete=models.PROTECT, related_name="bookings")

    kind = models.CharField(max_length=12)
    tier = models.CharField(max_length=10, choices=Tier.choices, default=Tier.STANDARD)
    guests = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(20)])
    start_date = models.DateField()
    end_date = models.DateField()
    start_time = models.TimeField(default=time(9, 0))
    meeting_point = models.CharField(max_length=200, blank=True)
    note = models.CharField(max_length=1000, blank=True)
    service_snapshot = models.JSONField(default=dict, help_text="What was sold, frozen at request time.")

    # Money, whole rupees. total = fare + insurance_fee. commission + captain_net = fare.
    fare = models.PositiveIntegerField()
    insurance_fee = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField()
    commission = models.PositiveIntegerField()
    captain_net = models.PositiveIntegerField()
    insurance_premium = models.PositiveIntegerField(default=0, help_text="Our cost to the insurer.")
    insurance_policy_no = models.CharField(max_length=32, blank=True)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.REQUESTED)
    cancelled_by = models.CharField(max_length=10, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    refund_percent = models.PositiveSmallIntegerField(null=True, blank=True)

    start_pin = models.CharField(max_length=4, blank=True, help_text="Traveler shows it; Captain enters it to start.")
    share_token = models.CharField(max_length=32, unique=True, default=_share_token)

    request_expires_at = models.DateTimeField(null=True, blank=True)
    payment_due_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["captain", "status", "start_date"]),
            models.Index(fields=["traveler", "-created_at"]),
            models.Index(fields=["status", "request_expires_at"]),
            models.Index(fields=["status", "payment_due_at"]),
            models.Index(fields=["-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(end_date__gte=models.F("start_date")), name="booking_dates_ordered"),
            models.CheckConstraint(condition=models.Q(total=models.F("fare") + models.F("insurance_fee")), name="booking_total_adds_up"),
        ]

    def __str__(self):
        return self.code

    @property
    def starts_at(self) -> datetime:
        return timezone.make_aware(datetime.combine(self.start_date, self.start_time))

    @property
    def is_paid(self):
        return self.status in self.PAID


class BookingEvent(models.Model):
    """Timeline shown to all three apps and used by support/audit."""

    id = models.BigAutoField(primary_key=True)
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    actor_role = models.CharField(max_length=10)
    kind = models.CharField(max_length=32)
    message = models.CharField(max_length=300)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
