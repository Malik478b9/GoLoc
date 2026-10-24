"""
Phone numbers are stored in E.164 form (+919876543210) so the same person
can't end up with two accounts because they typed "09876543210" once and
"9876543210" the next time.
"""
import re

from django.conf import settings

_E164 = re.compile(r"^\+[1-9]\d{7,14}$")
_INDIAN_MOBILE = re.compile(r"^[6-9]\d{9}$")


class InvalidPhoneNumber(ValueError):
    pass


def normalize_phone(raw: str) -> str:
    """
    Accepts what people actually type and returns E.164, or raises
    InvalidPhoneNumber.

        "98765 43210"     -> "+919876543210"
        "09876543210"     -> "+919876543210"
        "919876543210"    -> "+919876543210"
        "+91 98765-43210" -> "+919876543210"
        "+14155550123"    -> "+14155550123"   (other countries need the +)
    """
    if raw is None:
        raise InvalidPhoneNumber("Phone number is required.")
    value = re.sub(r"[\s\-().]", "", str(raw))
    if not value:
        raise InvalidPhoneNumber("Phone number is required.")

    default_cc = settings.OTP_DEFAULT_COUNTRY_CODE

    if value.startswith("00"):
        value = "+" + value[2:]

    if not value.startswith("+"):
        if not value.isdigit():
            raise InvalidPhoneNumber("Phone number can only contain digits.")
        if value.startswith("0"):
            value = value.lstrip("0")
        if len(value) == 10:
            value = f"+{default_cc}{value}"
        elif default_cc and value.startswith(default_cc) and len(value) == 10 + len(default_cc):
            value = "+" + value
        else:
            raise InvalidPhoneNumber("Enter a 10-digit mobile number.")

    if not _E164.match(value):
        raise InvalidPhoneNumber("Enter a valid phone number.")

    if value.startswith("+91") and not _INDIAN_MOBILE.match(value[3:]):
        raise InvalidPhoneNumber("Enter a valid Indian mobile number.")

    return value


def mask_phone(e164: str) -> str:
    """+919876543210 -> +91 ••••••3210 — safe to put in logs and UI."""
    if not e164 or len(e164) < 6:
        return "••••"
    return f"{e164[:3]} ••••••{e164[-4:]}"
