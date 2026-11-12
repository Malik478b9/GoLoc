"""
Coupons and gift vouchers on a booking, while it waits for payment (status=accepted).

  coupon   one per booking; money off the fare (percent with a cap, flat, or free group seats)
  voucher  one per booking; pays part or all of what's left from the traveler's own gift balance

GoLoc funds both: commission and captain_net never change. The server alone decides
amounts, and re-prices the booking whenever either changes:
    total = fare + insurance_fee - discount - voucher_amount        (what's left to pay by card/UPI)

A voucher's balance is taken when it's put on a booking and given back if that booking
is never paid (expired, withdrawn) or, for the voucher's share, when a paid trip is refunded.
"""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.common.api import bad_request, conflict

from .models import Booking, Coupon, GiftVoucher

S = Booking.Status
# A booking "uses" its coupon while it holds it for payment, and for good once paid.
HOLDING = (S.ACCEPTED, S.CONFIRMED, S.IN_PROGRESS, S.COMPLETED)


def _uses(qs):
    return qs.filter(Q(status__in=HOLDING) | Q(status=S.CANCELLED, confirmed_at__isnull=False))


def _log(booking, user, kind, message, **data):
    from .services import log

    log(booking, user, "traveler" if user else "system", kind, message, **data)


# ---------------------------------------------------------------- coupons
def coupon_problem(coupon: Coupon, booking: Booking, now=None) -> str | None:
    """None if this coupon can go on this booking; otherwise why not (shown to the traveler)."""
    now = now or timezone.now()
    if not coupon.is_active:
        return "This coupon isn't active."
    if coupon.starts_at and now < coupon.starts_at:
        return f"This coupon starts on {timezone.localtime(coupon.starts_at):%d %b}."
    if coupon.ends_at and now >= coupon.ends_at:
        return "This coupon has expired."
    is_group = booking.group_id is not None
    if coupon.trip_kind == Coupon.TripKind.GROUP and not is_group:
        return "This coupon is for group trips."
    if coupon.trip_kind == Coupon.TripKind.PRIVATE and is_group:
        return "This coupon isn't for group trips."
    if coupon.kind == Coupon.Kind.FREE_SEAT and not is_group:
        return "This offer is for group trip seats."
    if coupon.city_id and coupon.city_id != booking.city_id:
        return "This coupon isn't valid in this city."
    if coupon.captain_id and coupon.captain_id != booking.captain_id:
        return "This coupon isn't valid for this Captain."
    if booking.guests < coupon.min_guests:
        return f"Book {coupon.min_guests} or more {'seats' if is_group else 'guests'} to use this."
    if booking.fare < coupon.min_fare:
        return f"Valid on trips of ₹{coupon.min_fare:,} or more."
    others = coupon.bookings.exclude(pk=booking.pk)
    if coupon.max_uses is not None and _uses(others).count() >= coupon.max_uses:
        return "This coupon has been fully used."
    if _uses(others.filter(traveler_id=booking.traveler_id)).count() >= coupon.per_user_limit:
        return "You've already used this coupon."
    if coupon.first_trip_only and Booking.objects.filter(traveler_id=booking.traveler_id, confirmed_at__isnull=False).exclude(
            pk=booking.pk).exists():
        return "This coupon is for your first trip."
    if coupon.discount_for(booking.fare, booking.guests) <= 0:
        return "This coupon doesn't take anything off this trip."
    return None


def _lock_booking(booking, traveler=None) -> Booking:
    b = Booking.objects.select_for_update().get(pk=booking.pk)
    if traveler is not None and b.traveler_id != traveler.id:
        raise conflict("This isn't your booking.", "not_yours")
    if b.status != S.ACCEPTED:
        raise conflict("Offers can only change before you pay.", "not_payable")
    return b


def _reprice(b: Booking, voucher_user=None):
    """Recompute total after a coupon change; keep any voucher but shrink it if it now covers more than the bill."""
    b.discount = b.coupon.discount_for(b.fare, b.guests) if b.coupon_id else 0
    due = b.fare + b.insurance_fee - b.discount
    if b.voucher_id and b.voucher_amount > due:
        v = GiftVoucher.objects.select_for_update().get(pk=b.voucher_id)
        v.balance += b.voucher_amount - due
        v.save(update_fields=["balance", "updated_at"])
        b.voucher_amount = due
    b.total = due - b.voucher_amount
    b.save(update_fields=["coupon", "discount", "voucher", "voucher_amount", "total", "updated_at"])


def apply_coupon(booking, traveler, code: str) -> Booking:
    code = str(code or "").strip().upper()
    if not code:
        raise bad_request("Enter a coupon code.", "coupon_required")
    with transaction.atomic():
        b = _lock_booking(booking, traveler)
        coupon = Coupon.objects.select_for_update().filter(code=code).first()
        if coupon is None:
            raise bad_request("That coupon code doesn't exist. Check the spelling.", "coupon_not_found")
        problem = coupon_problem(coupon, b)
        if problem:
            raise bad_request(problem, "coupon_invalid")
        b.coupon = coupon
        _reprice(b)
        _log(b, traveler, "coupon_applied", f"Coupon {coupon.code} applied · ₹{b.discount:,} off")
    return b


def remove_coupon(booking, traveler) -> Booking:
    with transaction.atomic():
        b = _lock_booking(booking, traveler)
        if b.coupon_id:
            code = b.coupon.code
            b.coupon = None
            _reprice(b)
            _log(b, traveler, "coupon_removed", f"Coupon {code} removed")
    return b


def auto_apply(booking) -> Booking:
    """Put the best automatic offer (e.g. FIRSTTRIP, PAY3GET4) on a booking that just became payable. Never raises."""
    try:
        with transaction.atomic():
            b = Booking.objects.select_for_update().get(pk=booking.pk)
            if b.status != S.ACCEPTED or b.coupon_id:
                return b
            best, best_off = None, 0
            for c in Coupon.objects.select_for_update().filter(is_active=True, auto_apply=True):
                if coupon_problem(c, b) is None:
                    off = c.discount_for(b.fare, b.guests)
                    if off > best_off:
                        best, best_off = c, off
            if best:
                b.coupon = best
                _reprice(b)
                _log(b, None, "coupon_applied", f"Offer {best.code} applied · ₹{b.discount:,} off")
            return b
    except Exception:  # noqa: BLE001 — an offer must never block a booking
        return booking


# ---------------------------------------------------------------- vouchers
def my_vouchers(user, usable_only=True):
    qs = GiftVoucher.objects.filter(phone_number=user.phone_number)
    if usable_only:
        qs = qs.filter(status=GiftVoucher.Status.ACTIVE, balance__gt=0, expires_at__gt=timezone.now())
    return qs.order_by("expires_at")


def apply_voucher(booking, traveler, code: str) -> Booking:
    code = str(code or "").strip().upper()
    with transaction.atomic():
        b = _lock_booking(booking, traveler)
        v = GiftVoucher.objects.select_for_update().filter(code=code).first()
        if v is None or v.phone_number != traveler.phone_number:
            raise bad_request("That voucher isn't on your account.", "voucher_not_found")
        if v.status != GiftVoucher.Status.ACTIVE:
            raise bad_request("That voucher was cancelled.", "voucher_cancelled")
        if v.expires_at <= timezone.now():
            raise bad_request("That voucher has expired.", "voucher_expired")
        if b.voucher_id:  # swap: give the old one back first
            old = GiftVoucher.objects.select_for_update().get(pk=b.voucher_id)
            old.balance += b.voucher_amount
            old.save(update_fields=["balance", "updated_at"])
            if old.pk == v.pk:
                v = old
            b.voucher, b.voucher_amount = None, 0
        due = b.fare + b.insurance_fee - b.discount
        use = min(v.balance, due)
        if use <= 0:
            raise bad_request("This voucher has no balance left.", "voucher_empty")
        v.balance -= use
        v.save(update_fields=["balance", "updated_at"])
        b.voucher, b.voucher_amount = v, use
        b.total = due - use
        b.save(update_fields=["voucher", "voucher_amount", "total", "updated_at"])
        _log(b, traveler, "voucher_applied", f"Gift voucher ₹{use:,} used")
    return b


def remove_voucher(booking, traveler) -> Booking:
    with transaction.atomic():
        b = _lock_booking(booking, traveler)
        _release_voucher(b)
    return b


def _release_voucher(b: Booking, amount: int | None = None, *, save=True):
    """Give voucher balance back. `amount=None` returns all of it and detaches the voucher (unpaid booking)."""
    if not b.voucher_id:
        return 0
    back = b.voucher_amount if amount is None else min(amount, b.voucher_amount)
    if back > 0:
        v = GiftVoucher.objects.select_for_update().get(pk=b.voucher_id)
        v.balance = min(v.amount, v.balance + back)
        v.save(update_fields=["balance", "updated_at"])
    if amount is None and save:
        b.voucher, b.voucher_amount = None, 0
        b.total = b.fare + b.insurance_fee - b.discount
        b.save(update_fields=["voucher", "voucher_amount", "total", "updated_at"])
    return back


def release_unpaid(booking):
    """A booking that was never paid (expired, withdrawn, cancelled before payment): its voucher balance goes back."""
    with transaction.atomic():
        b = Booking.objects.select_for_update().get(pk=booking.pk)
        if b.confirmed_at is None and b.voucher_id:
            _release_voucher(b)


def give_back(booking, amount: int) -> int:
    """A paid booking was refunded: put the voucher's share (from pricing.refund_split) back on the voucher."""
    if not booking.voucher_id or amount <= 0:
        return 0
    with transaction.atomic():
        return _release_voucher(booking, amount, save=False)


# ---------------------------------------------------------------- what the traveler sees
def offers_for(booking) -> dict:
    now = timezone.now()
    coupons = []
    for c in Coupon.objects.filter(is_active=True, is_public=True).filter(
            Q(ends_at__isnull=True) | Q(ends_at__gt=now)).filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now))[:30]:
        problem = coupon_problem(c, booking, now)
        coupons.append({"code": c.code, "title": c.title, "description": c.description,
                        "discount": c.discount_for(booking.fare, booking.guests) if problem is None else 0,
                        "eligible": problem is None, "reason": problem or "", "applied": c.pk == booking.coupon_id})
    coupons.sort(key=lambda r: (not r["applied"], not r["eligible"], -r["discount"]))
    vouchers = [voucher_dict(v) for v in my_vouchers(booking.traveler)]
    if booking.voucher_id and all(v["code"] != booking.voucher.code for v in vouchers):
        vouchers.insert(0, voucher_dict(booking.voucher))
    return {"coupons": coupons, "vouchers": vouchers}


def voucher_dict(v: GiftVoucher) -> dict:
    return {"code": v.code, "amount": v.amount, "balance": v.balance, "message": v.message,
            "expires_at": v.expires_at, "status": v.status, "usable": v.usable, "created_at": v.created_at}
