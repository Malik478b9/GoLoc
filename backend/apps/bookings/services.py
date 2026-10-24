"""
Every booking state change goes through here, so the rules (and the
notifications, timeline and money side effects) live in one place.
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.captains.models import CaptainProfile
from apps.captains.services import unavailable_reason
from apps.common.api import bad_request, conflict
from apps.common.models import next_public_code
from apps.notifications.service import notify, notify_admins

from . import pricing
from .models import Booking, BookingEvent

S = Booking.Status


def log(booking, actor, role, kind, message, **data):
    BookingEvent.objects.create(booking=booking, actor=actor, actor_role=role, kind=kind, message=message[:300], data=data)


def _lock(booking) -> Booking:
    return Booking.objects.select_for_update().select_related("captain__user", "traveler", "service").get(pk=booking.pk)


def _require(booking, *statuses, message="This booking can't do that right now."):
    if booking.status not in statuses:
        raise conflict(message, "invalid_status")


# ---------------------------------------------------------------- request
def create_request(traveler, service, *, tier, guests, start_date, start_time=None, meeting_point="", note="") -> Booking:
    captain = service.captain
    if not service.is_active or not captain.is_bookable:
        raise conflict("This Captain isn't taking bookings right now.", "not_bookable")
    if captain.user_id == traveler.id:
        raise bad_request("You can't book your own service.", "own_service")
    if service.kind == "package":
        if tier not in {"normal", "medium", "lavish"}:
            raise bad_request("Choose Normal, Medium or Lavish.", "tier_required")
    else:
        tier = Booking.Tier.STANDARD
    if guests > service.max_guests:
        raise bad_request(f"This trip takes up to {service.max_guests} guests.", "too_many_guests")
    today = timezone.localdate()
    if start_date < today:
        raise bad_request("Choose today or a later date.", "date_in_past")
    if start_date > today + timedelta(days=settings.BOOKING_MAX_DAYS_AHEAD):
        raise bad_request(f"Bookings open {settings.BOOKING_MAX_DAYS_AHEAD} days ahead.", "too_far_ahead")
    end_date = start_date + timedelta(days=pricing.trip_days(service) - 1)
    start_time = start_time or service.start_time

    q = pricing.quote(service, tier, guests)
    with transaction.atomic():
        CaptainProfile.objects.select_for_update().get(pk=captain.pk)
        reason = unavailable_reason(captain, start_date, end_date)
        if reason:
            raise conflict(reason, "unavailable")
        duplicate = Booking.objects.filter(
            traveler=traveler, service=service, start_date=start_date, status__in=Booking.ACTIVE
        ).exists()
        if duplicate:
            raise conflict("You already have a request for this trip on that date.", "duplicate_request")
        booking = Booking(
            code=next_public_code("BKG"), traveler=traveler, captain=captain, service=service, city=captain.city,
            kind=service.kind, tier=tier, guests=guests, start_date=start_date, end_date=end_date, start_time=start_time,
            meeting_point=meeting_point[:200], note=note[:1000], service_snapshot=_snapshot(service),
            fare=q.fare, insurance_fee=q.insurance_fee, total=q.total, commission=q.commission,
            captain_net=q.captain_net, insurance_premium=q.insurance_premium,
        )
        booking.request_expires_at = min(timezone.now() + timedelta(hours=settings.REQUEST_EXPIRY_HOURS), booking.starts_at)
        booking.save()
        log(booking, traveler, "traveler", "requested", f"Requested for {guests} guest(s)")
    notify(captain.user, "captain", "booking_requested", f"New request · {booking.code}",
           f"{traveler.full_name or 'A traveler'} · {service.title} · {start_date:%d %b} · ₹{booking.fare:,}",
           {"booking_id": booking.id})
    return booking


def _snapshot(service):
    return {
        "title": service.title, "category": service.category, "kind": service.kind,
        "duration_hours": service.duration_hours, "duration_days": service.duration_days,
        "stops": service.stops, "itinerary": service.itinerary, "tier_inclusions": service.tier_inclusions,
    }


# ---------------------------------------------------------------- captain decisions
def accept(booking, captain_user) -> Booking:
    with transaction.atomic():
        booking = _lock(booking)
        _require(booking, S.REQUESTED, message="This request is no longer open.")
        CaptainProfile.objects.select_for_update().get(pk=booking.captain_id)
        reason = unavailable_reason(booking.captain, booking.start_date, booking.end_date, exclude_booking_id=booking.pk)
        if reason:
            raise conflict(reason, "unavailable")
        now = timezone.now()
        booking.status = S.ACCEPTED
        booking.accepted_at = now
        booking.payment_due_at = min(now + timedelta(minutes=settings.PAYMENT_WINDOW_MINUTES), booking.starts_at)
        booking.save(update_fields=["status", "accepted_at", "payment_due_at", "updated_at"])
        log(booking, captain_user, "captain", "accepted", "Captain accepted")
    booking.captain.touch()
    notify(booking.traveler, "traveler", "booking_accepted", f"{booking.captain.name} accepted 🎉",
           f"Pay ₹{booking.total:,} within {settings.PAYMENT_WINDOW_MINUTES // 60} hours to confirm {booking.code}.",
           {"booking_id": booking.id})
    return booking


def decline(booking, captain_user, reason="") -> Booking:
    with transaction.atomic():
        booking = _lock(booking)
        _require(booking, S.REQUESTED, message="This request is no longer open.")
        booking.status = S.DECLINED
        booking.cancel_reason = reason[:300]
        booking.save(update_fields=["status", "cancel_reason", "updated_at"])
        log(booking, captain_user, "captain", "declined", reason or "Captain declined")
    booking.captain.touch()
    notify(booking.traveler, "traveler", "booking_declined", f"{booking.captain.name} can't take {booking.code}",
           reason or "Try another date or Captain.", {"booking_id": booking.id})
    return booking


# ---------------------------------------------------------------- payment
def mark_paid(booking) -> Booking:
    """Called inside the payment capture transaction with the booking row locked."""
    booking.status = S.CONFIRMED
    booking.confirmed_at = timezone.now()
    booking.start_pin = f"{secrets.randbelow(10000):04d}"
    booking.insurance_policy_no = f"INS-{booking.code}"
    booking.save(update_fields=["status", "confirmed_at", "start_pin", "insurance_policy_no", "updated_at"])
    log(booking, booking.traveler, "traveler", "paid", f"Paid ₹{booking.total:,} · insurance {booking.insurance_policy_no}")
    notify(booking.captain.user, "captain", "booking_confirmed", f"Confirmed · {booking.code}",
           f"{booking.traveler.full_name or 'Traveler'} paid. Trip on {booking.start_date:%d %b}.", {"booking_id": booking.id})
    notify(booking.traveler, "traveler", "booking_confirmed", "You're booked ✅",
           f"{booking.code} with {booking.captain.name} on {booking.start_date:%d %b}. Trip PIN: {booking.start_pin}",
           {"booking_id": booking.id})
    return booking


# ---------------------------------------------------------------- cancel
def cancel(booking, user, role: str, reason: str, refund_percent: int | None = None) -> Booking:
    from apps.payments import services as payments

    with transaction.atomic():
        booking = _lock(booking)
        if role == "traveler":
            _require(booking, S.REQUESTED, S.ACCEPTED, S.CONFIRMED, message="This trip can't be cancelled now.")
        elif role == "captain":
            _require(booking, S.ACCEPTED, S.CONFIRMED, message="This trip can't be cancelled now.")
        else:
            _require(booking, S.REQUESTED, S.ACCEPTED, S.CONFIRMED, S.IN_PROGRESS, message="This trip can't be cancelled now.")
        was_paid = booking.is_paid
        percent = refund_percent if refund_percent is not None else pricing.refund_percent_for(booking, role)
        amount = pricing.refund_amount(booking, percent) if was_paid else 0
        booking.status = S.CANCELLED
        booking.cancelled_by = role
        booking.cancel_reason = reason[:300]
        booking.cancelled_at = timezone.now()
        booking.refund_percent = percent if was_paid else None
        booking.save(update_fields=["status", "cancelled_by", "cancel_reason", "cancelled_at", "refund_percent", "updated_at"])
        log(booking, user, role, "cancelled", reason or "Cancelled", refund_percent=percent, refund_amount=amount)
    # After the cancel is committed: a gateway hiccup must not undo the cancellation
    # (a failed refund is recorded and Admin is alerted to retry).
    if amount:
        payments.refund(booking, amount, f"Cancelled by {role}", user)

    other = (booking.captain.user, "captain") if role != "captain" else (booking.traveler, "traveler")
    notify(other[0], other[1], "booking_cancelled", f"{booking.code} was cancelled",
           reason or f"Cancelled by the {role}.", {"booking_id": booking.id})
    if role == "captain" and was_paid:
        notify_admins("captain_cancelled", f"Captain cancelled a paid trip · {booking.code}",
                      f"{booking.captain.code} · {reason}", {"booking_id": booking.id})
    return booking


def cancellation_preview(booking, role) -> dict:
    percent = pricing.refund_percent_for(booking, role)
    return {
        "refund_percent": percent,
        "refund_amount": pricing.refund_amount(booking, percent) if booking.is_paid else 0,
        "schedule": pricing.refund_schedule_for_display(),
    }


# ---------------------------------------------------------------- trip day
def start_trip(booking, captain_user, pin: str) -> Booking:
    with transaction.atomic():
        booking = _lock(booking)
        _require(booking, S.CONFIRMED, message="Only confirmed (paid) trips can start.")
        if timezone.localdate() < booking.start_date:
            raise conflict(f"This trip starts on {booking.start_date:%d %b}.", "too_early")
        if not secrets.compare_digest(str(pin).strip(), booking.start_pin):
            raise bad_request("That PIN doesn't match. Ask the traveler for the 4-digit trip PIN.", "bad_pin")
        booking.status = S.IN_PROGRESS
        booking.started_at = timezone.now()
        booking.save(update_fields=["status", "started_at", "updated_at"])
        log(booking, captain_user, "captain", "started", "Trip started")
    booking.captain.touch()
    notify(booking.traveler, "traveler", "trip_started", "Your trip has started",
           "Live tracking and SOS are on. Have a great time!", {"booking_id": booking.id})
    return booking


def complete_trip(booking, user, role="captain") -> Booking:
    from apps.payments import services as payments

    with transaction.atomic():
        booking = _lock(booking)
        _require(booking, S.IN_PROGRESS, message="Only trips in progress can be completed.")
        booking.status = S.COMPLETED
        booking.completed_at = timezone.now()
        booking.save(update_fields=["status", "completed_at", "updated_at"])
        log(booking, user, role, "completed", "Trip completed")
        payments.credit_trip(booking)
        CaptainProfile.objects.filter(pk=booking.captain_id).update(
            last_active_at=timezone.now(), trips_completed=F("trips_completed") + 1
        )
    notify(booking.traveler, "traveler", "trip_completed", f"How was your trip with {booking.captain.name}?",
           "Leave a review — it helps other travelers.", {"booking_id": booking.id})
    notify(booking.captain.user, "captain", "earning_credited", f"₹{booking.captain_net:,} added to your wallet",
           f"{booking.code} completed.", {"booking_id": booking.id})
    return booking


# ---------------------------------------------------------------- housekeeping
def expire_stale(now=None) -> int:
    now = now or timezone.now()
    count = 0
    stale = list(Booking.objects.filter(status=S.REQUESTED, request_expires_at__lt=now).values_list("pk", flat=True))
    stale += list(Booking.objects.filter(status=S.ACCEPTED, payment_due_at__lt=now).values_list("pk", flat=True))
    for pk in stale:
        with transaction.atomic():
            booking = Booking.objects.select_for_update().select_related("traveler", "captain__user").get(pk=pk)
            if booking.status == S.REQUESTED and booking.request_expires_at and booking.request_expires_at < now:
                why = "Captain didn't respond in time"
            elif booking.status == S.ACCEPTED and booking.payment_due_at and booking.payment_due_at < now:
                why = "Payment wasn't completed in time"
            else:
                continue
            booking.status = S.EXPIRED
            booking.cancel_reason = why
            booking.save(update_fields=["status", "cancel_reason", "updated_at"])
            log(booking, None, "system", "expired", why)
            count += 1
        notify(booking.traveler, "traveler", "booking_expired", f"{booking.code} expired", why, {"booking_id": booking.id})
        notify(booking.captain.user, "captain", "booking_expired", f"{booking.code} expired", why, {"booking_id": booking.id})
    return count
