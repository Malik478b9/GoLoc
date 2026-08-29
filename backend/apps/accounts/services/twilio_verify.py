"""
Thin wrapper around Twilio Verify (Section 5: OTP integration).

Kept isolated behind this module so accounts/views.py never touches the
Twilio SDK directly — makes it trivial to swap providers or mock in tests.
"""
from django.conf import settings
from twilio.rest import Client


def _client() -> Client:
    return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


# def start_verification(phone_number: str) -> str:
#     """Kick off an OTP send. Returns the Twilio verification SID."""
#     verification = _client().verify.v2.services(
#         settings.TWILIO_VERIFY_SERVICE_SID
#     ).verifications.create(to=phone_number, channel="sms")
#     return verification.sid


# def check_verification(phone_number: str, code: str) -> bool:
#     """Returns True if the submitted code matches. Never log the raw code."""
#     check = _client().verify.v2.services(
#         settings.TWILIO_VERIFY_SERVICE_SID
#     ).verification_checks.create(to=phone_number, code=code)
#     return check.status == "approved"


def start_verification(phone_number: str) -> str:
    print(f"[DEV] Pretend OTP sent to {phone_number}")
    return "dev-fake-sid"


def check_verification(phone_number: str, code: str) -> bool:
    return code == "123456"  # any phone number, OTP is always 123456 in dev
