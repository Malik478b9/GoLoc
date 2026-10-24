from django.conf import settings
from django.db import models


class Ticket(models.Model):
    """Help request or dispute. Admin can resolve with a refund."""

    class Category(models.TextChoices):
        PAYMENT = "payment", "Payment / refund"
        CANCELLATION = "cancellation", "Cancellation"
        SERVICE = "service", "Service quality"
        SAFETY = "safety", "Safety concern"
        ACCOUNT = "account", "Account"
        PAYOUT = "payout", "Payout"
        OTHER = "other", "Something else"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_REVIEW = "in_review", "In review"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=16, unique=True)
    raised_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets")
    role = models.CharField(max_length=10)
    booking = models.ForeignKey("bookings.Booking", null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    category = models.CharField(max_length=14, choices=Category.choices)
    subject = models.CharField(max_length=120)
    description = models.TextField(max_length=3000)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    resolution = models.TextField(max_length=2000, blank=True)
    refund_amount = models.PositiveIntegerField(default=0)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"]), models.Index(fields=["raised_by", "role", "-created_at"])]
