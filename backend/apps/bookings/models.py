import uuid

from django.conf import settings
from django.db import models


def _next_bkg_id():
    seq = Booking.objects.count() + 1
    return f"BKG-{seq:07d}"


class Booking(models.Model):
    """
    The central marketplace object (BKG-ID, per BR-7). One booking always
    references exactly one Traveler, one Captain, and one Service+Tier.
    """

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        ACCEPTED = "accepted", "Accepted"
        PAID = "paid", "Paid"                 # unlocks SOS/insurance — BR-5
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"   # triggers payout — BR-2
        CANCELLED_BY_TRAVELER = "cancelled_by_traveler", "Cancelled by traveler"
        CANCELLED_BY_CAPTAIN = "cancelled_by_captain", "Cancelled by captain"
        DISPUTED = "disputed", "Disputed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bkg_id = models.CharField(max_length=20, unique=True, db_index=True, editable=False)

    traveler = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bookings_as_traveler"
    )
    captain = models.ForeignKey(
        "captains.CaptainProfile", on_delete=models.PROTECT, related_name="bookings"
    )
    service = models.ForeignKey("captains.Service", on_delete=models.PROTECT, related_name="bookings")
    pricing_tier = models.ForeignKey(
        "captains.PricingTier", on_delete=models.PROTECT, related_name="bookings"
    )

    pax_count = models.PositiveSmallIntegerField(default=1)
    trip_start_date = models.DateField()
    trip_end_date = models.DateField()

    fare_amount = models.DecimalField(max_digits=12, decimal_places=2)
    insurance_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # BR-6
    tip_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    commission_rate = models.DecimalField(
        max_digits=4, decimal_places=3, default=0.180,
        help_text="Platform commission rate at time of booking, e.g. 0.180 = 18%.",
    )

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.REQUESTED)

    # BR-5: pay-to-protect — these only mean anything once status == PAID.
    sos_active = models.BooleanField(default=False)
    insurance_active = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["captain", "status"]),
            models.Index(fields=["traveler", "status"]),
        ]

    def save(self, *args, **kwargs):
        if not self.bkg_id:
            self.bkg_id = _next_bkg_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.bkg_id

    @property
    def total_amount(self):
        return self.fare_amount + self.insurance_amount + self.tip_amount

    @property
    def commission_amount(self):
        return round(self.fare_amount * self.commission_rate, 2)

    @property
    def captain_net_amount(self):
        """BR-2: Captain's net share of the fare (excludes insurance, which flows to the insurer)."""
        return round(self.fare_amount - self.commission_amount, 2)


class CancellationPolicy(models.Model):
    """
    BR-4: Time-based refunds — 100/75/50/25/0% by window before trip start;
    Captain-initiated cancellation is always 100% regardless of window.
    Stored as data so Admin can tune windows without a deploy.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hours_before_trip = models.PositiveIntegerField(help_text="Cancel at least this many hours before trip start")
    refund_percentage = models.PositiveSmallIntegerField(help_text="0-100")

    class Meta:
        ordering = ["-hours_before_trip"]

    def __str__(self):
        return f">= {self.hours_before_trip}h before trip -> {self.refund_percentage}% refund"


class Refund(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="refund")
    refund_percentage = models.PositiveSmallIntegerField()
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2)
    razorpay_refund_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class PackageBookingLineItem(models.Model):
    """
    BR-8, applied at booking time: a snapshot of the Captain's package
    logistics (hotel/food/transport) for this specific BKG, independent of
    later edits to the underlying PricingTier/PackageLineItem template.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="package_line_items")
    category = models.CharField(max_length=20)
    description = models.CharField(max_length=255)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
