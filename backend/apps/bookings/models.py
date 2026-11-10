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
    agency = models.ForeignKey(
        "agencies.Agency", null=True, blank=True, on_delete=models.PROTECT, related_name="bookings",
        help_text="The agency the Captain worked for when this was booked: it gets the earnings and can reassign the trip.",
    )
    city = models.ForeignKey("cities.City", on_delete=models.PROTECT, related_name="bookings")
    group = models.ForeignKey(
        "bookings.GroupTrip", null=True, blank=True, on_delete=models.PROTECT, related_name="bookings",
        help_text="Set when the traveler joined a Captain's group departure (seats shared with other travelers).",
    )

    kind = models.CharField(max_length=12)
    tier = models.CharField(max_length=10, choices=Tier.choices, default=Tier.STANDARD)
    guests = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(20)])
    guest_details = models.JSONField(
        default=list, blank=True,
        help_text='One {"name", "phone"} per guest; guest 1 is the traveler. Captains see names only.',
    )
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
    end_pin = models.CharField(max_length=4, blank=True, help_text="Traveler shows it on the last day; Captain enters it to finish.")
    share_token = models.CharField(max_length=32, unique=True, default=_share_token)
    # The traveler's consent to show their phone number to the Captain (only ever on a paid booking).
    traveler_shares_contact = models.BooleanField(default=False)
    contact_shared_at = models.DateTimeField(null=True, blank=True)

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


class GroupTrip(models.Model):
    """
    A Captain's group departure: a fixed date, a number of seats and a price per seat.
    Travelers who don't know each other join by buying seats; each gets their own Booking
    (own payment, trip PIN, insurance, SOS and refund), linked here by Booking.group.
    The departure holds one of the Captain's daily slots from the moment it's posted.

      open ──(enough joined)──▶ runs on the day        open ──cancel / too few joined──▶ cancelled
    """

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CANCELLED = "cancelled", "Cancelled"

    # Seats count as taken from the moment a traveler joins (they then have a short window to pay).
    SEAT_STATUSES = (Booking.Status.ACCEPTED, Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS, Booking.Status.COMPLETED)
    PAID_STATUSES = Booking.PAID

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=16, unique=True, help_text="Public ID, e.g. GRP-1001.")
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.PROTECT, related_name="group_trips")
    service = models.ForeignKey("captains.ServiceOffer", on_delete=models.PROTECT, related_name="group_trips")
    city = models.ForeignKey("cities.City", on_delete=models.PROTECT, related_name="group_trips")

    title = models.CharField(max_length=120)
    start_date = models.DateField()
    end_date = models.DateField()
    start_time = models.TimeField(default=time(9, 0))
    meeting_point = models.CharField(max_length=200, blank=True)
    note = models.CharField(max_length=1000, blank=True, help_text="Anything joiners should know: pace, what to bring, who it suits.")
    seats = models.PositiveSmallIntegerField(validators=[MinValueValidator(2), MaxValueValidator(30)])
    min_seats = models.PositiveSmallIntegerField(default=2, validators=[MinValueValidator(1)],
                                                 help_text="Paid seats needed for the trip to run.")
    price_per_seat = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    cancel_reason = models.CharField(max_length=300, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_date", "start_time"]
        indexes = [models.Index(fields=["status", "start_date"]), models.Index(fields=["captain", "status", "start_date"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(end_date__gte=models.F("start_date")), name="group_dates_ordered"),
            models.CheckConstraint(condition=models.Q(min_seats__lte=models.F("seats")), name="group_min_within_seats"),
        ]

    def __str__(self):
        return self.code

    @property
    def starts_at(self) -> datetime:
        return timezone.make_aware(datetime.combine(self.start_date, self.start_time))

    def seats_taken(self) -> int:
        return sum(self.bookings.filter(status__in=self.SEAT_STATUSES).values_list("guests", flat=True))

    def seats_paid(self) -> int:
        return sum(self.bookings.filter(status__in=self.PAID_STATUSES).values_list("guests", flat=True))


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
