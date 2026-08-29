import uuid

from django.conf import settings
from django.db import models


class CaptainProfile(models.Model):
    """
    Business Profile module (Section 2.2). One-to-one with a User whose
    role == captain. Implements BR-1 (city-bound) and BR-3 (inactivity hold).
    """

    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_REVIEW = "in_review", "In review"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"

    class LifecycleStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        LIVE = "live", "Live"
        ON_HOLD = "on_hold", "On hold"          # BR-3
        SUSPENDED = "suspended", "Suspended"     # Admin/trust action

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="captain_profile"
    )
    cap_id = models.CharField(
        max_length=20, unique=True, db_index=True,
        help_text="Human-readable lookup ID for Admin (BR-7), e.g. CAP-HYD-0001",
    )

    # BR-1: city-bound unless Admin expands.
    home_city = models.ForeignKey("cities.City", on_delete=models.PROTECT, related_name="captains")
    expanded_cities = models.ManyToManyField(
        "cities.City", blank=True, related_name="expanded_captains",
        help_text="Additional cities this Captain may operate in, granted by Admin.",
    )

    business_name = models.CharField(max_length=150, blank=True)
    bio = models.TextField(blank=True)
    specialties = models.CharField(max_length=255, blank=True, help_text="Comma-separated tags")
    languages = models.CharField(max_length=255, blank=True)

    verification_status = models.CharField(
        max_length=16, choices=VerificationStatus.choices, default=VerificationStatus.PENDING
    )
    verification_docs_url = models.URLField(
        blank=True, help_text="Signed Azure Blob URL to KYC documents (private container)."
    )

    lifecycle_status = models.CharField(
        max_length=16, choices=LifecycleStatus.choices, default=LifecycleStatus.DRAFT
    )
    last_activity_at = models.DateTimeField(null=True, blank=True)

    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    total_trips = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["home_city", "lifecycle_status"])]

    def __str__(self):
        return f"{self.cap_id} · {self.business_name or self.user.full_name}"

    def is_bookable(self) -> bool:
        return (
            self.lifecycle_status == self.LifecycleStatus.LIVE
            and self.verification_status == self.VerificationStatus.VERIFIED
        )


class Vehicle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="vehicles")
    vehicle_type = models.CharField(max_length=50, help_text="e.g. Sedan, SUV, Bike")
    registration_number = models.CharField(max_length=20)
    seating_capacity = models.PositiveSmallIntegerField(default=4)

    def __str__(self):
        return f"{self.vehicle_type} ({self.registration_number})"


class Tier(models.TextChoices):
    NORMAL = "normal", "Normal"
    MEDIUM = "medium", "Medium"
    LAVISH = "lavish", "Lavish"


class Service(models.Model):
    """A Captain's bookable offering: a Day Experience or a multi-day Package."""

    class ServiceType(models.TextChoices):
        DAY_EXPERIENCE = "day_experience", "Day experience"
        PACKAGE = "package", "Full-service package"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="services")
    service_type = models.CharField(max_length=20, choices=ServiceType.choices)
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    duration_days = models.PositiveSmallIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class PricingTier(models.Model):
    """
    Per-tier pricing on a Service (Normal / Medium / Lavish — Section 2.4 / 3.3).
    Day experiences typically only populate `normal`.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="pricing_tiers")
    tier = models.CharField(max_length=10, choices=Tier.choices)
    price_per_person = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        unique_together = ["service", "tier"]

    def __str__(self):
        return f"{self.service.title} · {self.tier} · ₹{self.price_per_person}"


class PackageLineItem(models.Model):
    """
    BR-8: Package logistics — Captain owns hotel, food, transport per tier.
    Recorded against the pricing tier for cost tracking and dispute records.
    """

    class Category(models.TextChoices):
        HOTEL = "hotel", "Hotel / camp"
        FOOD = "food", "Food"
        TRANSPORT = "transport", "Transport"
        PERMIT = "permit", "Permit"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pricing_tier = models.ForeignKey(PricingTier, on_delete=models.CASCADE, related_name="line_items")
    category = models.CharField(max_length=20, choices=Category.choices)
    description = models.CharField(max_length=255)
    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2)


class Availability(models.Model):
    """Calendar slots a Captain has opened up for booking requests."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey(CaptainProfile, on_delete=models.CASCADE, related_name="availability_slots")
    date = models.DateField()
    is_available = models.BooleanField(default=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ["captain", "date"]
        ordering = ["date"]
