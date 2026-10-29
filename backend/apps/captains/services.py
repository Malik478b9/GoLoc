from collections import defaultdict
from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone

from apps.common.models import next_public_code

from .models import BlockedDate, CaptainProfile, VerificationDocument, WeeklySlot

MOTOR_KINDS = {"car", "suv", "motorcycle", "tempo"}


def create_profile(user, city, **fields) -> CaptainProfile:
    profile = CaptainProfile.objects.create(code=next_public_code("CAP"), user=user, city=city, **fields)
    WeeklySlot.objects.bulk_create([WeeklySlot(captain=profile, weekday=d, is_available=d < 6) for d in range(7)])
    return profile


def dates_between(start, end):
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


class _Calendar:
    """Everything needed to judge a date range, loaded in three queries."""

    def __init__(self, captain, start, end, exclude_booking_id=None):
        from apps.bookings.models import Booking

        self.captain = captain
        self.slots = {s.weekday: s for s in captain.weekly_slots.all()}
        self.blocked = set(captain.blocked_dates.filter(date__range=(start, end)).values_list("date", flat=True))
        busy = Booking.objects.filter(captain=captain, status__in=Booking.HOLDS_SLOT, start_date__lte=end, end_date__gte=start)
        if exclude_booking_id:
            busy = busy.exclude(pk=exclude_booking_id)
        self.busy = list(busy.values_list("start_date", "end_date"))

    def status(self, day) -> str:
        """free | off (not a working weekday) | blocked (day off) | booked (no capacity left)."""
        slot = self.slots.get(day.weekday())
        if slot is None or not slot.is_available:
            return "off"
        if day in self.blocked:
            return "blocked"
        if sum(1 for s, e in self.busy if s <= day <= e) >= self.captain.max_bookings_per_day:
            return "booked"
        return "free"

    def reason(self, day) -> str | None:
        name = self.captain.name
        return {
            "off": f"{name} doesn't work on {day:%A}s.",
            "blocked": f"{name} is unavailable on {day:%d %b}.",
            "booked": f"{name} is fully booked on {day:%d %b}.",
        }.get(self.status(day))


def unavailable_reason(captain: CaptainProfile, start, end, exclude_booking_id=None) -> str | None:
    """None when the Captain can take a trip over [start, end]; otherwise why not."""
    cal = _Calendar(captain, start, end, exclude_booking_id)
    for day in dates_between(start, end):
        reason = cal.reason(day)
        if reason:
            return reason
    return None


def nearest_available(captain: CaptainProfile, start, days: int, *, count=3, window=60, earliest=None) -> list[dict]:
    """
    The closest trips of the same length the Captain can take, before or after `start`,
    nearest first: [{"start_date", "end_date", "shift_days"}]. One calendar load for the window.
    """
    earliest = earliest or timezone.localdate()
    lo = max(earliest, start - timedelta(days=window))
    hi = start + timedelta(days=window + days)
    cal = _Calendar(captain, lo, hi)
    free = {day: cal.reason(day) is None for day in dates_between(lo, hi)}
    options = []
    for shift in sorted(range(-window, window + 1), key=lambda s: (abs(s), s < 0)):
        first = start + timedelta(days=shift)
        if shift == 0 or first < lo:
            continue
        last = first + timedelta(days=days - 1)
        if last > hi:
            continue
        if all(free.get(first + timedelta(days=i), False) for i in range(days)):
            options.append({"start_date": first, "end_date": last, "shift_days": shift})
            if len(options) >= count:
                break
    return options


def day_statuses(captain: CaptainProfile, start, end) -> list[dict]:
    """Every date in range with its status, for the month view on a Captain's profile."""
    cal = _Calendar(captain, start, end)
    today = timezone.localdate()
    return [{"date": day, "status": "past" if day < today else cal.status(day)} for day in dates_between(start, end)]


def free_for_trip(capacity: dict, start, end) -> set:
    """
    Which Captains can take a new trip on every day of [start, end].
    `capacity` maps Captain id → max_bookings_per_day. Three queries however many Captains.
    """
    from apps.bookings.models import Booking

    ids = list(capacity)
    days = list(dates_between(start, end))
    needed = {d.weekday() for d in days}
    working = defaultdict(set)
    for cid, weekday in WeeklySlot.objects.filter(captain_id__in=ids, is_available=True).values_list("captain_id", "weekday"):
        working[cid].add(weekday)
    blocked = set(BlockedDate.objects.filter(captain_id__in=ids, date__range=(start, end)).values_list("captain_id", flat=True))
    busy = defaultdict(list)
    for cid, s, e in Booking.objects.filter(captain_id__in=ids, status__in=Booking.HOLDS_SLOT, start_date__lte=end,
                                            end_date__gte=start).values_list("captain_id", "start_date", "end_date"):
        busy[cid].append((s, e))
    return {
        cid for cid, limit in capacity.items()
        if cid not in blocked and needed <= working[cid]
        and all(sum(1 for s, e in busy[cid] if s <= d <= e) < limit for d in days)
    }


def required_documents(captain: CaptainProfile) -> list[str]:
    required = [VerificationDocument.DocType.ID_PROOF]
    motor = captain.vehicles.filter(is_active=True, kind__in=MOTOR_KINDS)
    if motor.exists():
        required.append(VerificationDocument.DocType.DRIVING_LICENCE)
    # An agency's cars are its own paperwork; the Captain only shows the RC of a car they own.
    if motor.filter(agency__isnull=True).exists():
        required.append(VerificationDocument.DocType.VEHICLE_RC)
    return required


def checklist(captain: CaptainProfile) -> dict:
    docs = {}
    for d in captain.documents.all():  # newest first
        docs.setdefault(d.doc_type, d.status)
    required = required_documents(captain)
    docs_uploaded = all(docs.get(t) in {"pending", "approved"} for t in required)
    docs_approved = all(docs.get(t) == "approved" for t in required)
    agency = captain.agency
    items = [
        {"key": "profile", "label": "Business profile (bio, languages, categories)",
         "done": bool(captain.bio.strip() and captain.languages and captain.categories)},
        {"key": "photo", "label": "Profile photo", "done": bool(captain.avatar)},
        {"key": "service", "label": f"{agency.name} has listed a trip for you" if agency else "At least one service with prices",
         "done": captain.services.filter(is_active=True).exists()},
        {"key": "availability", "label": "Weekly availability", "done": captain.weekly_slots.filter(is_available=True).exists()},
        {"key": "documents", "label": "Verification documents uploaded", "done": docs_uploaded},
        {"key": "payout", "label": f"Payouts go to {agency.name}" if agency else "UPI or bank account for payouts",
         "done": bool(agency) or hasattr(captain, "payout_account")},
        {"key": "approved", "label": "Approved by GoLoc", "done": captain.review_status == CaptainProfile.ReviewStatus.APPROVED and docs_approved},
    ]
    done = sum(1 for i in items if i["done"])
    can_submit = all(i["done"] for i in items if i["key"] not in {"approved"}) and captain.review_status in {
        CaptainProfile.ReviewStatus.DRAFT, CaptainProfile.ReviewStatus.REJECTED}
    return {
        "items": items,
        "percent": round(done * 100 / len(items)),
        "can_submit": can_submit,
        "can_go_live": items[-1]["done"] and items[2]["done"] and not captain.is_on_hold
        and (agency is None or agency.is_active_business),
        "required_documents": required,
    }


def refresh_rating(captain_id):
    from apps.reviews.models import Review

    agg = Review.objects.filter(captain_id=captain_id, is_hidden=False).aggregate(avg=Avg("rating"), n=Count("id"))
    CaptainProfile.objects.filter(pk=captain_id).update(rating_avg=round(agg["avg"] or 0, 2), rating_count=agg["n"])
    from .signals import bump_discovery

    bump_discovery()


def apply_inactivity_holds() -> int:
    """BR-3: no activity for CAPTAIN_INACTIVITY_HOLD_DAYS → on hold until Admin releases."""
    from django.conf import settings

    from apps.notifications.service import notify

    cutoff = timezone.now() - timedelta(days=settings.CAPTAIN_INACTIVITY_HOLD_DAYS)
    stale = CaptainProfile.objects.filter(
        Q(review_status=CaptainProfile.ReviewStatus.APPROVED), is_on_hold=False, last_active_at__lt=cutoff
    ).select_related("user")
    count = 0
    for captain in stale:
        captain.is_on_hold = True
        captain.is_live = False
        captain.hold_reason = f"No activity for {settings.CAPTAIN_INACTIVITY_HOLD_DAYS} days"
        captain.save(update_fields=["is_on_hold", "is_live", "hold_reason", "updated_at"])
        notify(captain.user, "captain", "account_on_hold", "Your business is on hold",
               "No activity for a month. Contact GoLoc support to reactivate.", {})
        count += 1
    return count
