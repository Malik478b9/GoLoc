"""
OTP business logic, kept out of the views so it's easy to test and reuse
(the mobile apps, web apps and any future flow all go through here).

Protections, all per phone number and stored in the database so they hold
across every server process:

* resend cooldown (default 30 s between codes)
* hourly send cap (default 5 codes / hour) — stops SMS-pumping fraud
* code expiry (default 5 min)
* wrong-guess cap per code (default 5) — a 6-digit code can't be brute-forced
* a new code invalidates the previous one; a code works exactly once
"""
import hashlib
import hmac
import logging
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from ..models import OTPChallenge
from ..phone import mask_phone
from .providers import OTPDeliveryError, generate_code, get_provider

logger = logging.getLogger("goloc.otp")


class OTPError(Exception):
    code = "otp_error"
    message = "Something went wrong with the code."
    retry_after: int | None = None

    def __init__(self, message: str | None = None, retry_after: int | None = None):
        super().__init__(message or self.message)
        if message:
            self.message = message
        self.retry_after = retry_after


class ResendCooldown(OTPError):
    code = "otp_cooldown"
    message = "Please wait before requesting another code."


class TooManyRequests(OTPError):
    code = "otp_rate_limited"
    message = "Too many codes requested for this number. Try again later."


class InvalidCode(OTPError):
    code = "otp_invalid"
    message = "That code is incorrect or has expired."


class TooManyAttempts(OTPError):
    code = "otp_locked"
    message = "Too many wrong attempts. Request a new code."


class DeliveryFailed(OTPError):
    code = "otp_delivery_failed"
    message = "We couldn't send the SMS right now. Please try again in a minute."


def _hash(challenge_id, code: str) -> str:
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


@dataclass
class SentOTP:
    expires_in: int
    resend_in: int
    dev_code: str | None = None


def request_otp(phone_number: str, ip: str | None = None, *, deliver: bool = True) -> SentOTP:
    """
    Issue a new code for `phone_number` (already normalised).

    `deliver=False` records the challenge (so timing and rate limits look
    identical to the caller) but sends nothing — used when someone asks to
    sign in to the admin console with a number that isn't an admin, so we
    neither leak which numbers are admins nor pay for the SMS.
    """
    now = timezone.now()
    recent = OTPChallenge.objects.filter(phone_number=phone_number, created_at__gte=now - timedelta(hours=1))

    # Cooldown only while the last code is still usable. Once it has been used
    # (signed in) or has expired, a new code can be sent straight away.
    latest = recent.filter(consumed_at__isnull=True, expires_at__gt=now).first()
    if latest:
        wait = settings.OTP_RESEND_COOLDOWN_SECONDS - int((now - latest.created_at).total_seconds())
        if wait > 0:
            raise ResendCooldown(retry_after=wait)

    if recent.count() >= settings.OTP_MAX_SENDS_PER_HOUR:
        oldest = recent.order_by("created_at").first()
        wait = 3600 - int((now - oldest.created_at).total_seconds())
        raise TooManyRequests(retry_after=max(wait, 1))

    provider = get_provider()
    code = generate_code(settings.OTP_LENGTH) if provider.generates_code else None

    with transaction.atomic():
        # A new code supersedes any earlier one still floating around.
        OTPChallenge.objects.filter(
            phone_number=phone_number, consumed_at__isnull=True, expires_at__gt=now
        ).update(expires_at=now)
        challenge = OTPChallenge.objects.create(
            phone_number=phone_number,
            provider=provider.name if deliver else "suppressed",
            expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
            request_ip=ip,
        )
        if code:
            challenge.code_hash = _hash(challenge.id, code)
            challenge.save(update_fields=["code_hash"])

    if deliver:
        try:
            provider.send(phone_number, code)
        except OTPDeliveryError as exc:
            # Don't count a failed send against the person's hourly limit.
            challenge.delete()
            raise DeliveryFailed() from exc
        logger.info("OTP sent to %s via %s", mask_phone(phone_number), provider.name)
    else:
        logger.info("OTP suppressed for %s (not eligible)", mask_phone(phone_number))

    return SentOTP(
        expires_in=settings.OTP_TTL_SECONDS,
        resend_in=settings.OTP_RESEND_COOLDOWN_SECONDS,
        dev_code=code if (settings.OTP_EXPOSE_CODE_IN_RESPONSE and deliver) else None,
    )


def verify_otp(phone_number: str, code: str) -> None:
    """Raises an OTPError unless `code` is the live code for `phone_number`. Consumes it on success."""
    code = (code or "").strip()
    now = timezone.now()

    # Errors are decided inside the transaction but raised after it commits,
    # otherwise the rollback would undo the attempt counter.
    error: OTPError | None = None

    with transaction.atomic():
        challenge = (
            OTPChallenge.objects.select_for_update()
            .filter(phone_number=phone_number, consumed_at__isnull=True, expires_at__gt=now)
            .order_by("-created_at")
            .first()
        )
        if challenge is None:
            error = InvalidCode()
        elif challenge.attempts >= settings.OTP_MAX_ATTEMPTS:
            error = TooManyAttempts()
        else:
            # Count the attempt before checking, so concurrent guesses can't slip past the cap.
            OTPChallenge.objects.filter(pk=challenge.pk).update(attempts=F("attempts") + 1)
            attempts_used = challenge.attempts + 1

            if not code.isdigit() or len(code) != settings.OTP_LENGTH:
                ok = False
            elif challenge.provider == "suppressed":
                ok = False
            elif challenge.code_hash:
                ok = hmac.compare_digest(challenge.code_hash, _hash(challenge.id, code))
            else:
                try:
                    ok = get_provider().check(phone_number, code)
                except OTPDeliveryError:
                    ok = None

            if ok is None:
                error = DeliveryFailed("We couldn't check the code right now. Please try again.")
            elif not ok:
                error = TooManyAttempts() if attempts_used >= settings.OTP_MAX_ATTEMPTS else InvalidCode()
            else:
                OTPChallenge.objects.filter(pk=challenge.pk).update(consumed_at=now)

    if error:
        logger.info("OTP check failed for %s: %s", mask_phone(phone_number), error.code)
        raise error
    logger.info("OTP verified for %s", mask_phone(phone_number))
