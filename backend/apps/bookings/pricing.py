"""
Money rules in one place (spec §6). All amounts are whole rupees.

  fare        what the Captain's service costs for this group
              (guide hire: per-day group price × days between arrival and return)
  insurance   per booking (BR-6): INSURANCE_FEE_PER_GUEST_DAY × guests × days
  commission  PLATFORM_COMMISSION_PERCENT of fare (insurance is not commissioned)
  captain_net fare − commission, credited only after completion (BR-2)
"""
from dataclasses import asdict, dataclass

from django.conf import settings
from django.utils import timezone


@dataclass(frozen=True)
class Quote:
    fare: int
    insurance_fee: int
    total: int
    commission: int
    captain_net: int
    insurance_premium: int
    days: int

    def as_dict(self):
        return asdict(self)


def trip_days(service, days: int | None = None) -> int:
    """Packages have a fixed length; guide hire runs for the days the traveler picks; experiences are one day."""
    if service.kind == "package":
        return service.duration_days
    if service.kind == "guide":
        return max(1, days or 1)
    return 1


def quote(service, tier: str, guests: int, days: int | None = None) -> Quote:
    days = trip_days(service, days)
    if service.kind == "package":
        fare = service.tier_price(tier) * guests
    else:
        per_day = service.price + max(0, guests - service.included_guests) * service.extra_guest_price
        fare = per_day * (days if service.kind == "guide" else 1)
    insurance_fee = settings.INSURANCE_FEE_PER_GUEST_DAY * guests * days
    premium = settings.INSURANCE_PREMIUM_PER_GUEST_DAY * guests * days
    commission = round(fare * settings.PLATFORM_COMMISSION_PERCENT / 100)
    return Quote(
        fare=fare,
        insurance_fee=insurance_fee,
        total=fare + insurance_fee,
        commission=commission,
        captain_net=fare - commission,
        insurance_premium=premium,
        days=days,
    )


def refund_percent_for(booking, cancelled_by: str, now=None) -> int:
    """
    BR-4. Captain (or Admin on the Captain's behalf) cancelling → 100 %.
    Traveler cancelling → by hours left before the trip starts, per REFUND_SCHEDULE.
    """
    if cancelled_by in {"captain", "system"}:
        return 100
    now = now or timezone.now()
    hours_left = (booking.starts_at - now).total_seconds() / 3600
    for min_hours, percent in settings.REFUND_SCHEDULE:
        if hours_left >= min_hours:
            return percent
    return 0


def refund_amount(booking, percent: int) -> int:
    """Fare refunds per schedule; insurance is refunded in full when the trip never started."""
    fare_part = round(booking.fare * percent / 100)
    insurance_part = booking.insurance_fee if booking.status != booking.Status.IN_PROGRESS else 0
    return min(booking.total, fare_part + insurance_part)


def refund_schedule_for_display():
    rows = []
    for min_hours, percent in settings.REFUND_SCHEDULE:
        rows.append({"min_hours_before": min_hours, "fare_refund_percent": percent})
    return rows
