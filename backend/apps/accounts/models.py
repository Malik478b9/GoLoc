import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from .managers import UserManager


class User(AbstractUser):
    class Role(models.TextChoices):
        TRAVELER = "traveler", "Traveler"
        CAPTAIN = "captain", "Captain"
        ADMIN = "admin", "Admin"

    username = None  # ADD THIS — we key on phone_number instead

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.TRAVELER)
    phone_number = models.CharField(max_length=20, unique=True, db_index=True)
    phone_verified = models.BooleanField(default=False)
    full_name = models.CharField(max_length=150, blank=True)
    primary_city = models.ForeignKey(
        "cities.City", null=True, blank=True, on_delete=models.SET_NULL, related_name="users"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()  # ADD THIS

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.full_name or self.phone_number} ({self.role})"


class OTPRequest(models.Model):
    """
    Tracks an OTP verification round-trip against Twilio Verify.
    We never store the raw OTP — only the outcome — per the security note
    in Section 5 of the technical specification.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        EXPIRED = "expired", "Expired"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(
        max_length=32,
        default="signup",
        help_text="signup | login | sos_contact_change | payout_account_change",
    )
    twilio_sid = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["phone_number", "status"])]
