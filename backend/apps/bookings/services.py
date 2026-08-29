"""
Business rules engine for bookings — implements BR-2, BR-4, BR-5, BR-6 from
Section 2.4 of the technical specification. Kept out of views.py/models.py
so the rules are unit-testable in isolation and reusable from Celery tasks,
Razorpay webhooks, and the Admin console.
"""
from datetime import datetime, timezone as dt_timezone

from django.db import transaction
from django.utils import timezone

from apps.payments.models import PayoutLedgerEntry
from .models import Booking, CancellationPolicy, Refund


def default_cancellation_policy():
    """Fallback windows if Admin hasn't configured CancellationPolicy rows yet."""
    return [
        (72, 100),  # >= 72h before trip: full refund
        (24, 75),   # >= 24h: 75%
        (6, 50),    # >= 6h: 50%
        (0, 25),    # < 6h but before trip start: 25%
    ]


def calculate_refund_percentage(booking: Booking, cancelled_by: str) -> int:
    """
    BR-4: Time-based refunds; 100% override when the Captain cancels.
    `cancelled_by` is "traveler" or "captain".
    """
    if cancelled_by == "captain":
        return 100

    hours_remaining = (
        datetime.combine(booking.trip_start_date, datetime.min.time(), tzinfo=dt_timezone.utc)
        - timezone.now()
    ).total_seconds() / 3600

    policies = list(
        CancellationPolicy.objects.order_by("-hours_before_trip").values_list(
            "hours_before_trip", "refund_percentage"
        )
    ) or default_cancellation_policy()

    for hours_threshold, pct in policies:
        if hours_remaining >= hours_threshold:
            return pct
    return 0


@transaction.atomic
def cancel_booking(booking: Booking, cancelled_by: str) -> Refund:
    """Applies BR-4 and records the refund. Does not call Razorpay directly —
    that happens in apps.payments once this returns, keeping this module
    payment-provider-agnostic."""
    pct = calculate_refund_percentage(booking, cancelled_by)
    refund_amount = round(booking.total_amount * pct / 100, 2)

    booking.status = (
        Booking.Status.CANCELLED_BY_CAPTAIN
        if cancelled_by == "captain"
        else Booking.Status.CANCELLED_BY_TRAVELER
    )
    booking.cancelled_at = timezone.now()
    booking.sos_active = False
    booking.insurance_active = False
    booking.save(update_fields=["status", "cancelled_at", "sos_active", "insurance_active"])

    refund = Refund.objects.create(
        booking=booking, refund_percentage=pct, refund_amount=refund_amount
    )
    return refund


@transaction.atomic
def mark_booking_paid(booking: Booking):
    """
    Called from the Razorpay webhook consumer on payment success.
    BR-5: SOS + insurance activate only after in-app payment.
    """
    booking.status = Booking.Status.PAID
    booking.paid_at = timezone.now()
    booking.sos_active = True
    if booking.insurance_amount > 0:
        booking.insurance_active = True
    booking.save(update_fields=["status", "paid_at", "sos_active", "insurance_active"])

    # Captain's share moves to a "pending" ledger entry — not payable yet.
    PayoutLedgerEntry.objects.create(
        captain=booking.captain,
        booking=booking,
        amount=booking.captain_net_amount,
        status=PayoutLedgerEntry.Status.PENDING,
    )


@transaction.atomic
def complete_booking(booking: Booking):
    """
    BR-2: Captain net only after full trip completion. Flips the pending
    ledger entry to available-for-payout via Razorpay Route.
    """
    booking.status = Booking.Status.COMPLETED
    booking.completed_at = timezone.now()
    booking.save(update_fields=["status", "completed_at"])

    booking.captain.total_trips += 1
    booking.captain.last_activity_at = timezone.now()
    booking.captain.save(update_fields=["total_trips", "last_activity_at"])

    PayoutLedgerEntry.objects.filter(
        booking=booking, status=PayoutLedgerEntry.Status.PENDING
    ).update(status=PayoutLedgerEntry.Status.AVAILABLE)
