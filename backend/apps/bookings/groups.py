"""
Group departures: a Captain posts a date with seats; travelers who don't know each other join.

Each traveler's seats are an ordinary Booking (group=…), so payment, trip PIN, insurance,
live tracking, SOS, end PIN, review, refunds and the Captain's payout all work exactly
like a private trip. What's different:
  * no request/accept step: joining holds the seats and opens a short payment window;
  * the price is the Captain's fixed price per seat;
  * the departure (not each seat) holds one of the Captain's daily slots;
  * if too few seats are paid GROUP_DECIDE_HOURS before departure, it's cancelled
    automatically and everyone gets a full refund.
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.captains.models import CaptainProfile
from apps.captains.services import unavailable_reason
from apps.common.api import bad_request, conflict
from apps.common.models import next_public_code
from apps.notifications.service import notify

from . import pricing
from .models import Booking, GroupTrip
from .services import _snapshot, cancel, clean_guest_details, log, trip_end_date

S = Booking.Status


def _dates(g):
    return f"{g.start_date:%d %b}" if g.start_date == g.end_date else f"{g.start_date:%d %b} → {g.end_date:%d %b}"


def suggested_price(service) -> int:
    """A fair starting price per seat, shown pre-filled to the Captain."""
    if service.kind == "package":
        return service.normal_price
    return max(1, round(service.price / max(1, service.included_guests)))


def decide_at(group):
    return group.starts_at - timedelta(hours=settings.GROUP_DECIDE_HOURS)


# ---------------------------------------------------------------- captain
def create_group(captain, service, *, start_date, seats, min_seats, price_per_seat, start_time=None,
                 meeting_point="", note="", title="") -> GroupTrip:
    if service.captain_id != captain.pk:
        raise bad_request("Choose one of your own trips.", "not_your_service")
    if not service.is_active:
        raise conflict("This trip is switched off. Turn it on first.", "service_inactive")
    if service.kind == "guide":
        raise bad_request("Group trips need a day experience or a package, not guide-by-the-day.", "guide_not_groupable")
    if not captain.is_bookable:
        raise conflict("Your business has to be live to post group trips.", "not_bookable")
    if min_seats > seats:
        raise bad_request("The minimum can't be more than the seats.", "min_over_seats")
    today = timezone.localdate()
    if start_date < today + timedelta(days=1):
        raise bad_request("Post group trips at least one day ahead, so travelers have time to join.", "too_soon")
    if start_date > today + timedelta(days=settings.BOOKING_MAX_DAYS_AHEAD):
        raise bad_request(f"You can post up to {settings.BOOKING_MAX_DAYS_AHEAD} days ahead.", "too_far_ahead")
    end_date = trip_end_date(service, start_date)
    with transaction.atomic():
        CaptainProfile.objects.select_for_update().get(pk=captain.pk)
        reason = unavailable_reason(captain, start_date, end_date)
        if reason:
            raise conflict(reason, "unavailable")
        group = GroupTrip.objects.create(
            code=next_public_code("GRP"), captain=captain, service=service, city=captain.city,
            title=(title or service.title)[:120], start_date=start_date, end_date=end_date,
            start_time=start_time or service.start_time, meeting_point=meeting_point[:200], note=note[:1000],
            seats=seats, min_seats=min_seats, price_per_seat=price_per_seat,
        )
    captain.touch()
    return group


def cancel_group(group, user, role: str, reason: str) -> GroupTrip:
    """Cancel the whole departure: every traveler gets a full refund (Captain/system cancel, BR-4)."""
    with transaction.atomic():
        group = GroupTrip.objects.select_for_update().get(pk=group.pk)
        if group.status != GroupTrip.Status.OPEN:
            raise conflict("This group trip is already cancelled.", "invalid_status")
        if group.bookings.filter(status=S.IN_PROGRESS).exists():
            raise conflict("Some travelers have already started. End or cancel their trips one by one.", "already_started")
        group.status = GroupTrip.Status.CANCELLED
        group.cancel_reason = reason[:300]
        group.cancelled_at = timezone.now()
        group.save(update_fields=["status", "cancel_reason", "cancelled_at", "updated_at"])
        open_bookings = list(group.bookings.filter(status__in=[S.ACCEPTED, S.CONFIRMED]))
    for b in open_bookings:
        cancel(b, user, role, reason, notify_captain=False)
    return group


# ---------------------------------------------------------------- traveler
def join(traveler, group, *, guests: int, guest_details=None, note="") -> Booking:
    captain = group.captain
    service = group.service
    if group.status != GroupTrip.Status.OPEN:
        raise conflict("This group trip was cancelled.", "group_closed")
    if not captain.is_bookable:
        raise conflict("This Captain isn't taking bookings right now.", "not_bookable")
    if captain.user_id == traveler.id:
        raise bad_request("You can't join your own group trip.", "own_service")
    now = timezone.now()
    if now >= group.starts_at:
        raise conflict("This group trip has already left.", "group_departed")
    guest_details = clean_guest_details(traveler, guests, guest_details)
    days = (group.end_date - group.start_date).days + 1
    fare = group.price_per_seat * guests
    insurance_fee = settings.INSURANCE_FEE_PER_GUEST_DAY * guests * days
    commission = round(fare * settings.PLATFORM_COMMISSION_PERCENT / 100)

    with transaction.atomic():
        group = GroupTrip.objects.select_for_update().select_related("captain__user", "service").get(pk=group.pk)
        if group.status != GroupTrip.Status.OPEN:
            raise conflict("This group trip was cancelled.", "group_closed")
        if group.bookings.filter(traveler=traveler, status__in=Booking.ACTIVE).exists():
            raise conflict("You've already joined this group trip. Open it from My trips.", "already_joined")
        left = group.seats - group.seats_taken()
        if left <= 0:
            raise conflict("This group trip is full.", "group_full")
        if guests > left:
            raise conflict(f"Only {left} seat{'s' if left != 1 else ''} left.", "not_enough_seats")
        booking = Booking(
            code=next_public_code("BKG"), traveler=traveler, captain=captain, service=service, city=group.city,
            agency_id=captain.agency_id, group=group,
            kind=service.kind, tier=Booking.Tier.STANDARD, guests=guests, guest_details=guest_details,
            start_date=group.start_date, end_date=group.end_date, start_time=group.start_time,
            meeting_point=group.meeting_point, note=note[:1000],
            service_snapshot={**_snapshot(service), "title": group.title, "group": {"code": group.code, "price_per_seat": group.price_per_seat}},
            fare=fare, insurance_fee=insurance_fee, total=fare + insurance_fee, commission=commission,
            captain_net=fare - commission,
            insurance_premium=settings.INSURANCE_PREMIUM_PER_GUEST_DAY * guests * days,
            status=S.ACCEPTED, accepted_at=now,
            payment_due_at=min(now + timedelta(minutes=settings.GROUP_PAYMENT_MINUTES), group.starts_at),
        )
        booking.save()
        log(booking, traveler, "traveler", "joined_group", f"Joined group trip {group.code} · {guests} seat(s)")
    notify(traveler, "traveler", "group_joined", f"Seats held on {group.title}",
           f"Pay ₹{booking.total:,} within {settings.GROUP_PAYMENT_MINUTES} minutes to keep your {guests} seat(s).",
           {"booking_id": booking.id})
    return booking


def joined_paid(booking):
    """After payment: tell the Captain someone joined. Called from bookings.services.mark_paid."""
    group = booking.group
    paid = group.seats_paid()
    left = group.seats - group.seats_taken()
    extra = "The trip will run! " if paid >= group.min_seats else f"{group.min_seats - paid} more needed to run. "
    notify(booking.captain.user, "captain", "group_seat_paid",
           f"{booking.traveler.full_name or 'A traveler'} joined {group.title}",
           f"{booking.guests} seat(s) paid · {paid}/{group.seats} filled. {extra}{left} left.",
           {"booking_id": booking.id, "group_id": group.id})


# ---------------------------------------------------------------- housekeeping
def settle_undersubscribed(now=None) -> int:
    """GROUP_DECIDE_HOURS before departure: not enough paid seats → cancel with full refunds."""
    now = now or timezone.now()
    count = 0
    horizon = (now + timedelta(hours=settings.GROUP_DECIDE_HOURS)).date() + timedelta(days=1)
    for group in GroupTrip.objects.filter(status=GroupTrip.Status.OPEN, start_date__lte=horizon).select_related("captain__user"):
        if decide_at(group) > now or group.starts_at <= now - timedelta(days=1):
            continue
        paid = group.seats_paid()
        if paid >= group.min_seats:
            continue
        reason = f"Not enough travelers joined ({paid} of the {group.min_seats} needed). Full refund."
        try:
            cancel_group(group, None, "system", reason)
        except Exception:  # noqa: BLE001 — one stuck group mustn't block the rest; it's retried next run
            continue
        notify(group.captain.user, "captain", "group_cancelled", f"{group.title} didn't fill",
               f"{group.code} on {_dates(group)} was cancelled: {paid} of {group.min_seats} seats paid. Everyone was refunded.",
               {"group_id": group.id})
        count += 1
    return count
