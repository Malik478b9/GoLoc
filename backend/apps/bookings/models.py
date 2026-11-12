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

    # Money, whole rupees. total = fare + insurance_fee - discount - voucher_amount. commission + captain_net = fare.
    fare = models.PositiveIntegerField()
    insurance_fee = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField()
    commission = models.PositiveIntegerField()
    captain_net = models.PositiveIntegerField()
    insurance_premium = models.PositiveIntegerField(default=0, help_text="Our cost to the insurer.")
    insurance_policy_no = models.CharField(max_length=32, blank=True)
    # Offers. GoLoc funds both, so commission and captain_net never change.
    #   coupon  -> `discount` off the fare
    #   voucher -> `voucher_amount` paid from the traveler's gift-voucher balance
    # total is what's left to pay by card/UPI: fare + insurance_fee - discount - voucher_amount.
    coupon = models.ForeignKey("bookings.Coupon", null=True, blank=True, on_delete=models.PROTECT, related_name="bookings")
    discount = models.PositiveIntegerField(default=0)
    voucher = models.ForeignKey("bookings.GiftVoucher", null=True, blank=True, on_delete=models.PROTECT, related_name="bookings")
    voucher_amount = models.PositiveIntegerField(default=0)

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
            models.CheckConstraint(
                condition=models.Q(total=models.F("fare") + models.F("insurance_fee") - models.F("discount") - models.F("voucher_amount")),
                name="booking_total_adds_up"),
            models.CheckConstraint(condition=models.Q(discount=0) | models.Q(discount__lt=models.F("fare")), name="booking_discount_below_fare"),
        ]

    def __str__(self):
        return self.code

    @property
    def starts_at(self) -> datetime:
        return timezone.make_aware(datetime.combine(self.start_date, self.start_time))

    @property
    def is_paid(self):
        return self.status in self.PAID

    @property
    def paid_value(self) -> int:
        """What the traveler actually put in: card/UPI plus voucher balance (fare after coupon, plus insurance)."""
        return self.total + self.voucher_amount


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


def _voucher_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    pick = lambda n: "".join(secrets.choice(alphabet) for _ in range(n))  # noqa: E731
    return f"GV-{pick(4)}-{pick(4)}"


class Coupon(models.Model):
    """
    A discount GoLoc's admins set up. Takes money off the trip fare (never insurance);
    GoLoc pays for it, so the Captain still earns their full share.

    A coupon counts as used while a booking holds it waiting for payment, and for good
    once that booking is paid. If payment never happens it's free again.
    """

    class Kind(models.TextChoices):
        PERCENT = "percent", "Percent off"
        FLAT = "flat", "Flat rupees off"
        FREE_SEAT = "free_seat", "Free seats (group trips)"

    class TripKind(models.TextChoices):
        ANY = "", "Any trip"
        PRIVATE = "private", "Private trips only"
        GROUP = "group", "Group trips only"

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True, help_text="What travelers type, e.g. FIRSTTRIP. Stored in capitals.")
    title = models.CharField(max_length=80, help_text='Shown to travelers, e.g. "10% off your first trip".')
    description = models.CharField(max_length=300, blank=True)

    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PERCENT)
    value = models.PositiveIntegerField(validators=[MinValueValidator(1)],
                                        help_text="Percent (1-100), rupees, or number of free seats.")
    max_discount = models.PositiveIntegerField(null=True, blank=True, help_text="Most it can take off, in rupees. Empty = no cap.")
    min_fare = models.PositiveIntegerField(default=0, help_text="Only on trips whose fare is at least this.")
    min_guests = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1)],
                                                  help_text="Only when booking at least this many seats/guests.")

    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    max_uses = models.PositiveIntegerField(null=True, blank=True, help_text="Total uses across everyone. Empty = unlimited.")
    per_user_limit = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1)])

    first_trip_only = models.BooleanField(default=False, help_text="Only for travelers who've never paid for a trip.")
    auto_apply = models.BooleanField(default=False, help_text="Applied by itself when a traveler can use it, no code needed.")
    is_public = models.BooleanField(default=True, help_text="Listed under offers at payment. Off = secret code.")
    is_active = models.BooleanField(default=True)

    city = models.ForeignKey("cities.City", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    captain = models.ForeignKey("captains.CaptainProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    trip_kind = models.CharField(max_length=8, choices=TripKind.choices, default=TripKind.ANY, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=~models.Q(kind="percent") | models.Q(value__lte=100), name="coupon_percent_max_100"),
        ]

    def __str__(self):
        return self.code

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def discount_for(self, fare: int, guests: int) -> int:
        """Rupees off this fare. Always leaves at least 1 rupee of fare."""
        if self.kind == self.Kind.PERCENT:
            off = round(fare * self.value / 100)
        elif self.kind == self.Kind.FREE_SEAT:
            off = (fare // max(1, guests)) * min(self.value, max(0, guests - 1))
        else:
            off = self.value
        if self.max_discount:
            off = min(off, self.max_discount)
        return max(0, min(off, fare - 1))


class GiftVoucher(models.Model):
    """
    A GoLoc gift voucher with a rupee balance, given free by GoLoc to one mobile number.
    Only that number can use it. The balance carries over across trips until it runs out
    or expires; a cancelled trip puts the voucher part back.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=16, unique=True, default=_voucher_code)
    phone_number = models.CharField(max_length=16, db_index=True, help_text="E.164. Only this number can use it.")
    amount = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    balance = models.PositiveIntegerField()
    message = models.CharField(max_length=200, blank=True, help_text="Shown to the person, e.g. Happy birthday!")
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.CheckConstraint(condition=models.Q(balance__lte=models.F("amount")), name="voucher_balance_within_amount")]

    def __str__(self):
        return self.code

    @property
    def usable(self) -> bool:
        return self.status == self.Status.ACTIVE and self.balance > 0 and self.expires_at > timezone.now()


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
