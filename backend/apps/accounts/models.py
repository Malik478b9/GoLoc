import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractUser):
    """
    One account per phone number. The same person can use the Traveler app
    and the Captain app with the same number.

    Which app a request comes from is carried in the JWT (`role` claim), not
    on this row, so being logged into both apps at once works. `role` here
    only records the most recent app they signed in to (handy for support
    and analytics). Admin access is never self-service: it requires
    `is_staff`, which only an existing admin or the `create_admin`
    management command can grant.
    """

    class Role(models.TextChoices):
        TRAVELER = "traveler", "Traveler"
        CAPTAIN = "captain", "Captain"
        ADMIN = "admin", "Admin"

    username = None  # phone_number is the identity field

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=20, unique=True, db_index=True, help_text="E.164, e.g. +919876543210")
    phone_verified = models.BooleanField(default=False)
    full_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(
        max_length=16, choices=Role.choices, default=Role.TRAVELER, help_text="Last app this person signed in to."
    )
    city = models.ForeignKey(
        "cities.City", null=True, blank=True, on_delete=models.SET_NULL, related_name="users",
        help_text="City the person last chose in the app.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.full_name or self.phone_number}"


class OTPChallenge(models.Model):
    """
    One "we sent you a code" event. Only the hash of the code is stored.
    Rows double as the audit log and the source of truth for per-phone rate
    limits, so they're never deleted on success — prune old ones with
    `manage.py prune_otp`.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=20, db_index=True)
    provider = models.CharField(max_length=32)
    code_hash = models.CharField(max_length=128, blank=True, help_text="Empty when the provider owns the code.")
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    request_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["phone_number", "-created_at"])]

    def __str__(self):
        return f"OTP {self.phone_number} @ {self.created_at:%Y-%m-%d %H:%M}"

    @property
    def is_usable(self) -> bool:
        return self.consumed_at is None and self.expires_at > timezone.now()


class TravelerProfile(models.Model):
    """Traveler-only details: SOS emergency contact and trip preferences."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="traveler_profile")
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    languages = models.JSONField(default=list, blank=True)
    interests = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
