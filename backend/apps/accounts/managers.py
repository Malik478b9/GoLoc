from django.contrib.auth.base_user import BaseUserManager

from .phone import normalize_phone


class UserManager(BaseUserManager):
    """Users are identified by phone_number (stored as E.164), not username."""

    use_in_migrations = True

    def _create_user(self, phone_number: str, password: str | None, **extra_fields):
        if not phone_number:
            raise ValueError("Phone number is required")
        user = self.model(phone_number=normalize_phone(phone_number), **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()  # OTP-only account
        user.save(using=self._db)
        return user

    def create_user(self, phone_number: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(phone_number, password, **extra_fields)

    def create_superuser(self, phone_number: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "admin")
        extra_fields.setdefault("phone_verified", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")
        return self._create_user(phone_number, password, **extra_fields)

    def get_by_natural_key(self, phone_number):
        # Lets Django admin's password login accept "9876543210" as well as "+919876543210".
        try:
            phone_number = normalize_phone(phone_number)
        except ValueError:
            pass
        return super().get_by_natural_key(phone_number)
