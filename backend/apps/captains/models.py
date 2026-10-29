import uuid
from datetime import time

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.common.files import private_storage, upload_to, validate_document, validate_image


class CaptainProfile(models.Model):
    """
    A local host's business. Bound to one city (BR-1). Visible to travelers
    only when approved by Admin, switched live by the Captain and not on hold.
    """

    class Type(models.TextChoices):
        CAPTAIN = "captain", "Captain · does everything"
        GUIDE = "guide", "Local guide"

    class ReviewStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Needs changes"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=16, unique=True, help_text="Public ID, e.g. CAP-1001.")
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="captain_profile")
    city = models.ForeignKey("cities.City", on_delete=models.PROTECT, related_name="captain_profiles")
    captain_type = models.CharField(
        max_length=8, choices=Type.choices, default=Type.CAPTAIN,
        help_text="Captain: full service (stays, transport, packages). Guide: walks with travelers in person and shows the way.",
    )
    tagline = models.CharField(max_length=140, blank=True)
    bio = models.TextField(max_length=2000, blank=True)
    avatar = models.ImageField(upload_to=upload_to("avatars"), validators=[validate_image], blank=True)
    years_experience = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(60)])
    languages = models.JSONField(default=list, blank=True)
    categories = models.JSONField(default=list, blank=True)
    agency = models.ForeignKey(
        "agencies.Agency", null=True, blank=True, on_delete=models.PROTECT, related_name="captains",
        help_text="Set when the Captain works for an agency: the agency sets trips and prices and receives the earnings.",
    )
    agency_joined_at = models.DateTimeField(null=True, blank=True)
    max_bookings_per_day = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(10)]
    )

    review_status = models.CharField(max_length=16, choices=ReviewStatus.choices, default=ReviewStatus.DRAFT)
    review_note = models.CharField(max_length=500, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    is_live = models.BooleanField(default=False)
    is_on_hold = models.BooleanField(default=False, help_text="BR-3: inactive > 30 days or held by Admin.")
    hold_reason = models.CharField(max_length=300, blank=True)
    is_featured = models.BooleanField(default=False)
    is_verified = models.BooleanField(
        default=False, help_text="GoLoc Verified badge, granted by Admin (a paid tier later). Separate from KYC approval.",
    )
    last_active_at = models.DateTimeField(default=timezone.now)

    # Denormalised so lists and feeds never aggregate per row.
    rating_avg = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    rating_count = models.PositiveIntegerField(default=0)
    trips_completed = models.PositiveIntegerField(default=0)
    profile_views = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["city", "is_live", "review_status", "is_on_hold"]),
            models.Index(fields=["review_status", "submitted_at"]),
            models.Index(fields=["-rating_avg"]),
        ]

    def __str__(self):
        return f"{self.code} {self.user.full_name}"

    @property
    def name(self):
        return self.user.full_name or self.code

    @property
    def is_bookable(self):
        return (self.is_live and not self.is_on_hold and self.review_status == self.ReviewStatus.APPROVED
                and (self.agency_id is None or self.agency.is_active_business))

    def touch(self):
        """Record activity for the BR-3 inactivity rule. Cheap: one UPDATE."""
        CaptainProfile.objects.filter(pk=self.pk).update(last_active_at=timezone.now())


class ServiceFields(models.Model):
    """
    What is sold, shared by a Captain's own services and an agency's trip catalog.
      experience — a day experience at one group price (+ per extra guest)
      guide      — an in-person guide hired by the day for the traveler's own dates;
                   group price per day (+ per extra guest per day). Traveler arranges stay/transport.
      package    — multi-day, Captain-managed logistics, priced per person by tier (Captains only)
    """

    class Kind(models.TextChoices):
        EXPERIENCE = "experience", "Day experience"
        GUIDE = "guide", "Guide by the day"
        PACKAGE = "package", "Full-service package"

    PER_DAY_KINDS = (Kind.GUIDE,)
    # Copied from an agency's catalog onto each of its Captains' services.
    COPIED_FIELDS = ("kind", "title", "description", "category", "cover_image", "max_guests", "price", "included_guests",
                     "extra_guest_price", "duration_hours", "start_time", "stops", "duration_days", "normal_price",
                     "medium_price", "lavish_price", "tier_inclusions", "itinerary")

    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.EXPERIENCE)
    title = models.CharField(max_length=120)
    description = models.TextField(max_length=2000, blank=True)
    category = models.CharField(max_length=40)
    cover_image = models.ImageField(upload_to=upload_to("services"), validators=[validate_image], blank=True)
    max_guests = models.PositiveSmallIntegerField(default=4, validators=[MinValueValidator(1), MaxValueValidator(20)])

    # experience pricing (₹ for the group)
    price = models.PositiveIntegerField(default=0)
    included_guests = models.PositiveSmallIntegerField(default=2, validators=[MinValueValidator(1)])
    extra_guest_price = models.PositiveIntegerField(default=0)
    duration_hours = models.PositiveSmallIntegerField(default=4, validators=[MinValueValidator(1), MaxValueValidator(24)])
    start_time = models.TimeField(default=time(9, 0))
    stops = models.JSONField(default=list, blank=True, help_text="Ordered list of stop names.")

    # package pricing (₹ per person)
    duration_days = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(30)])
    normal_price = models.PositiveIntegerField(default=0)
    medium_price = models.PositiveIntegerField(default=0)
    lavish_price = models.PositiveIntegerField(default=0)
    tier_inclusions = models.JSONField(default=dict, blank=True, help_text='{"normal": ["…"], "medium": […], …}')
    itinerary = models.JSONField(default=list, blank=True, help_text="One line per day.")

    class Meta:
        abstract = True

    def __str__(self):
        return self.title

    def tier_price(self, tier):
        return getattr(self, f"{tier}_price")

    @property
    def from_price(self):
        return self.normal_price if self.kind == self.Kind.PACKAGE else self.price


class ServiceOffer(ServiceFields):
    """What a Captain sells. For an agency's Captain it's a copy of the agency's trip, kept in sync."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="services")
    agency_service = models.ForeignKey(
        "agencies.AgencyService", null=True, blank=True, on_delete=models.SET_NULL, related_name="copies",
        help_text="Set when the agency manages this service: the Captain can't edit it.",
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["kind", "title"]
        indexes = [models.Index(fields=["captain", "is_active"]), models.Index(fields=["category", "is_active"])]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(kind__in=["experience", "guide"], price__gt=0))
                | models.Q(kind="package", normal_price__gt=0, medium_price__gte=models.F("normal_price"),
                           lavish_price__gte=models.F("medium_price")),
                name="service_prices_valid",
            ),
            models.UniqueConstraint(fields=["captain", "agency_service"], condition=models.Q(agency_service__isnull=False),
                                    name="one_copy_per_agency_service"),
        ]


class Vehicle(models.Model):
    class Kind(models.TextChoices):
        CAR = "car", "Car"
        SUV = "suv", "SUV / MPV"
        MOTORCYCLE = "motorcycle", "Motorcycle"
        TEMPO = "tempo", "Tempo traveller"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey(CaptainProfile, null=True, blank=True, on_delete=models.CASCADE, related_name="vehicles",
                                help_text="Who drives it. Agency cars can be unassigned.")
    agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.CASCADE, related_name="vehicles",
                               help_text="Set for an agency's own cars.")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    make_model = models.CharField(max_length=100)
    registration_number = models.CharField(max_length=20)
    capacity = models.PositiveSmallIntegerField(default=4, validators=[MinValueValidator(1), MaxValueValidator(30)])
    has_ac = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class VerificationDocument(models.Model):
    class DocType(models.TextChoices):
        ID_PROOF = "id_proof", "Government ID (Aadhaar / PAN / Passport)"
        DRIVING_LICENCE = "driving_licence", "Driving licence"
        VEHICLE_RC = "vehicle_rc", "Vehicle RC"
        VEHICLE_INSURANCE = "vehicle_insurance", "Vehicle insurance"
        POLICE_VERIFICATION = "police_verification", "Police verification"
        GUIDE_LICENCE = "guide_licence", "Tourist guide licence"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=24, choices=DocType.choices)
    file = models.FileField(upload_to=upload_to("kyc"), storage=private_storage, validators=[validate_document])
    number = models.CharField(max_length=40, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    note = models.CharField(max_length=300, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]


class WeeklySlot(models.Model):
    """Weekday availability. weekday: 0 = Monday … 6 = Sunday."""

    id = models.BigAutoField(primary_key=True)
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="weekly_slots")
    weekday = models.PositiveSmallIntegerField(validators=[MaxValueValidator(6)])
    is_available = models.BooleanField(default=True)
    start_time = models.TimeField(default=time(9, 0))
    end_time = models.TimeField(default=time(18, 0))

    class Meta:
        ordering = ["weekday"]
        constraints = [models.UniqueConstraint(fields=["captain", "weekday"], name="unique_captain_weekday")]


class BlockedDate(models.Model):
    id = models.BigAutoField(primary_key=True)
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="blocked_dates")
    date = models.DateField()
    reason = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["date"]
        constraints = [models.UniqueConstraint(fields=["captain", "date"], name="unique_captain_blocked_date")]


class BankAccount(models.Model):
    """Where payouts go. Shared by Captains and agencies."""

    class Method(models.TextChoices):
        UPI = "upi", "UPI"
        BANK = "bank", "Bank transfer"

    method = models.CharField(max_length=8, choices=Method.choices)
    account_holder = models.CharField(max_length=120)
    upi_id = models.CharField(max_length=80, blank=True)
    account_number = models.CharField(max_length=24, blank=True)
    ifsc = models.CharField(max_length=11, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    @property
    def masked(self):
        if self.method == self.Method.UPI:
            return self.upi_id
        return f"A/c ••••{self.account_number[-4:]} · {self.ifsc}"


class PayoutAccount(BankAccount):
    captain = models.OneToOneField(CaptainProfile, on_delete=models.CASCADE, primary_key=True, related_name="payout_account")


class SavedCaptain(models.Model):
    id = models.BigAutoField(primary_key=True)
    traveler = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_captains")
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="saved_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["traveler", "captain"], name="unique_saved_captain")]
