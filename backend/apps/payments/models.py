import uuid

from django.db import models


class Payment(models.Model):
    """Traveler-side payment via Razorpay Checkout for a single Booking."""

    class Status(models.TextChoices):
        CREATED = "created", "Created"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField("bookings.Booking", on_delete=models.CASCADE, related_name="payment")
    razorpay_order_id = models.CharField(max_length=64, blank=True)
    razorpay_payment_id = models.CharField(max_length=64, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CREATED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payment for {self.booking.bkg_id} ({self.status})"


class PayoutLedgerEntry(models.Model):
    """
    Captain earnings ledger. One row per booking's Captain-net share.
    Status moves PENDING (paid by traveler, trip not yet complete) ->
    AVAILABLE (BR-2: trip completed) -> PAID_OUT (Razorpay Route transfer done).
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending completion"
        AVAILABLE = "available", "Available for payout"
        PAID_OUT = "paid_out", "Paid out"
        HELD = "held", "Held (dispute/hold)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    captain = models.ForeignKey(
        "captains.CaptainProfile", on_delete=models.PROTECT, related_name="ledger_entries"
    )
    booking = models.OneToOneField("bookings.Booking", on_delete=models.CASCADE, related_name="ledger_entry")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    razorpay_route_transfer_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_out_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["captain", "status"])]

    def __str__(self):
        return f"{self.captain.cap_id} · ₹{self.amount} · {self.status}"
