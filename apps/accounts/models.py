import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    """
    One account, phone-number-keyed. `role` is which mode the person is
    currently in (set on every OTP verify from the app they logged in
    through) — the same phone number can hold both a Traveler and a
    Captain identity later; for this minimal step there's no separate
    "profile" model yet, just the role switch itself.
    """

    class Role(models.TextChoices):
        TRAVELER = "traveler", "Traveler"
        CAPTAIN = "captain", "Captain"
        ADMIN = "admin", "Admin"

    username = None  # replaced by phone_number as the identity field

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=20, unique=True, db_index=True)
    phone_verified = models.BooleanField(default=False)
    full_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.TRAVELER)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.full_name or self.phone_number} ({self.role})"
