"""
OTP delivery providers. The rest of the app only talks to `get_provider()`,
so switching SMS vendors (Twilio → MSG91, say) means adding one class here.

Two styles exist in the wild and both are supported:

* We generate the code and the provider just delivers an SMS
  (`generates_code = True`). We store a hash and check it ourselves.
* The provider generates *and* checks the code (Twilio Verify). We never
  see the code; `check()` asks the provider.
"""
import logging
import secrets

import requests
from django.conf import settings

from ..phone import mask_phone

logger = logging.getLogger("goloc.otp")


class OTPDeliveryError(Exception):
    """The SMS provider couldn't be reached or refused the request."""


def generate_code(length: int) -> str:
    if settings.OTP_DEV_FIXED_CODE:  # only ever set when DEBUG=True
        return settings.OTP_DEV_FIXED_CODE
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


class BaseProvider:
    name = "base"
    generates_code = True

    def send(self, phone_number: str, code: str | None) -> None:
        raise NotImplementedError

    def check(self, phone_number: str, code: str) -> bool:
        """Only called for providers that own the code (generates_code=False)."""
        raise NotImplementedError


class ConsoleProvider(BaseProvider):
    """Development only — writes the code to the server log instead of sending an SMS."""

    name = "console"

    def send(self, phone_number, code):
        logger.warning("[DEV OTP] %s -> %s", phone_number, code)


class TwilioVerifyProvider(BaseProvider):
    """https://www.twilio.com/docs/verify/api — Twilio generates, sends and checks the code."""

    name = "twilio_verify"
    generates_code = False
    timeout = 10

    def _url(self, path: str) -> str:
        return f"https://verify.twilio.com/v2/Services/{settings.TWILIO_VERIFY_SERVICE_SID}/{path}"

    def _post(self, path: str, data: dict) -> dict:
        try:
            resp = requests.post(
                self._url(path),
                data=data,
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            logger.error("Twilio Verify unreachable: %s", exc)
            raise OTPDeliveryError("SMS provider unreachable") from exc
        if resp.status_code == 404 and path == "VerificationCheck":
            # Twilio returns 404 when the verification expired or was already used.
            return {"status": "expired"}
        if resp.status_code >= 400:
            logger.error("Twilio Verify %s failed for %s: %s %s",
                         path, mask_phone(data.get("To", "")), resp.status_code, resp.text[:300])
            raise OTPDeliveryError(f"SMS provider error {resp.status_code}")
        return resp.json()

    def send(self, phone_number, code):
        self._post("Verifications", {"To": phone_number, "Channel": "sms"})

    def check(self, phone_number, code):
        result = self._post("VerificationCheck", {"To": phone_number, "Code": code})
        return result.get("status") == "approved"


PROVIDERS = {cls.name: cls for cls in (ConsoleProvider, TwilioVerifyProvider)}


def get_provider() -> BaseProvider:
    try:
        return PROVIDERS[settings.OTP_PROVIDER]()
    except KeyError as exc:
        raise RuntimeError(f"Unknown OTP_PROVIDER '{settings.OTP_PROVIDER}'") from exc
