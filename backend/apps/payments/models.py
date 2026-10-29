import uuid

from django.conf import settings
from django.db import models


class Payment(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        CAPTURED = "captured", "Captured"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"
        PARTIALLY_REFUNDED = "partially_refunded", "Partially refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, related_name="payments")
    gateway = models.CharField(max_length=16)
    order_id = models.CharField(max_length=64, unique=True)
    payment_id = models.CharField(max_length=64, blank=True, db_index=True)
    amount = models.PositiveIntegerField(help_text="₹")
    refunded_amount = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREATED)
    method = models.CharField(max_length=20, blank=True)
    error = models.CharField(max_length=300, blank=True)
    captured_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["booking", "status"]), models.Index(fields=["status", "-created_at"])]

    @property
    def refundable(self):
        return self.amount - self.refunded_amount


class Refund(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSED = "processed", "Processed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, related_name="refunds")
    amount = models.PositiveIntegerField()
    reason = models.CharField(max_length=300)
    gateway_refund_id = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Payout(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=16, unique=True)
    # Exactly one of these: who is being paid.
    captain = models.ForeignKey("captains.CaptainProfile", null=True, blank=True, on_delete=models.PROTECT, related_name="payouts")
    agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.PROTECT, related_name="payouts")
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED)
    destination = models.CharField(max_length=120, help_text="Masked UPI / bank account at request time.")
    reference = models.CharField(max_length=64, blank=True, help_text="UTR / transfer reference.")
    note = models.CharField(max_length=300, blank=True)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(captain__isnull=False) ^ models.Q(agency__isnull=False), name="payout_has_one_payee"),
        ]

    @property
    def payee_name(self):
        return self.agency.name if self.agency_id else self.captain.name

    @property
    def payee_code(self):
        return self.agency.code if self.agency_id else self.captain.code


class LedgerEntry(models.Model):
    """
    Wallets. Append-only; balance = SUM(amount). Credits land only when
    a trip completes (BR-2); a payout request debits immediately so the same
    money can't be requested twice; a failed payout is reversed with a credit.

    agency empty → the Captain's own wallet. agency set → the agency's wallet; `captain`
    then records which of its Captains did the trip (empty on agency payouts).
    """

    class Kind(models.TextChoices):
        TRIP_EARNING = "trip_earning", "Trip earning"
        PAYOUT = "payout", "Payout"
        PAYOUT_REVERSAL = "payout_reversal", "Payout reversal"
        ADJUSTMENT = "adjustment", "Adjustment"

    id = models.BigAutoField(primary_key=True)
    captain = models.ForeignKey("captains.CaptainProfile", null=True, blank=True, on_delete=models.PROTECT, related_name="ledger")
    agency = models.ForeignKey("agencies.Agency", null=True, blank=True, on_delete=models.PROTECT, related_name="ledger")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    amount = models.IntegerField(help_text="₹, signed")
    booking = models.ForeignKey("bookings.Booking", null=True, blank=True, on_delete=models.PROTECT)
    payout = models.ForeignKey(Payout, null=True, blank=True, on_delete=models.PROTECT)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["captain", "-created_at"]), models.Index(fields=["agency", "-created_at"])]
        constraints = [
            models.UniqueConstraint(fields=["booking"], condition=models.Q(kind="trip_earning"), name="one_earning_per_booking"),
        ]


class WebhookEvent(models.Model):
    """Dedupe gateway webhooks (they are retried and can arrive twice)."""

    event_id = models.CharField(max_length=80, primary_key=True)
    received_at = models.DateTimeField(auto_now_add=True)
