import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.common.api import bad_request, conflict
from apps.common.models import next_public_code
from apps.notifications.service import notify, notify_admins

from .gateways import GatewayError, get_gateway
from .models import LedgerEntry, Payment, Payout, Refund

logger = logging.getLogger("goloc.payments")


# ---------------------------------------------------------------- collection
def create_order(booking) -> Payment:
    from apps.bookings.models import Booking

    if booking.status != Booking.Status.ACCEPTED:
        raise conflict("This booking isn't waiting for payment.", "not_payable")
    if booking.payment_due_at and booking.payment_due_at < timezone.now():
        raise conflict("The payment window has closed. Please send a new request.", "payment_window_closed")
    existing = booking.payments.filter(status=Payment.Status.CREATED, amount=booking.total).first()
    if existing:
        return existing
    gateway = get_gateway()
    try:
        order_id = gateway.create_order(booking.total, booking.code, {"booking": booking.code})
    except GatewayError as exc:
        raise conflict(str(exc), "gateway_error") from exc
    return Payment.objects.create(booking=booking, gateway=gateway.name, order_id=order_id, amount=booking.total)


def capture(payment: Payment, payment_id: str, signature: str, method: str = "") -> Payment:
    """Called by the checkout page and by the webhook. Idempotent."""
    from apps.bookings import services as booking_services
    from apps.bookings.models import Booking

    gateway = get_gateway(payment.gateway)
    if not gateway.verify_payment(payment.order_id, payment_id, signature):
        raise bad_request("Payment signature didn't match.", "bad_signature")

    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment.pk)
        if payment.status != Payment.Status.CREATED:
            return payment
        payment.payment_id = payment_id
        payment.method = method[:20]
        payment.status = Payment.Status.CAPTURED
        payment.captured_at = timezone.now()
        payment.save(update_fields=["payment_id", "method", "status", "captured_at", "updated_at"])

        booking = Booking.objects.select_for_update().select_related("captain__user", "traveler").get(pk=payment.booking_id)
        late = booking.status != Booking.Status.ACCEPTED
        if not late:
            booking_services.mark_paid(booking)
    if late:
        # Paid after the window closed or after a cancel — never keep the money.
        refund(booking, payment.amount, "Payment arrived after booking closed", None)
    return payment


def mark_failed(payment: Payment, reason: str):
    Payment.objects.filter(pk=payment.pk, status=Payment.Status.CREATED).update(
        status=Payment.Status.FAILED, error=reason[:300]
    )


# ---------------------------------------------------------------- refunds
def refund(booking, amount: int, reason: str, by_user) -> list[Refund]:
    """Refund up to `amount` across this booking's captured payments."""
    if amount <= 0:
        return []
    created = []
    remaining = amount
    with transaction.atomic():
        payments = Payment.objects.select_for_update().filter(
            booking=booking, status__in=[Payment.Status.CAPTURED, Payment.Status.PARTIALLY_REFUNDED]
        )
        for payment in payments:
            if remaining <= 0:
                break
            part = min(remaining, payment.refundable)
            if part <= 0:
                continue
            row = Refund.objects.create(payment=payment, booking=booking, amount=part, reason=reason[:300], created_by=by_user)
            try:
                row.gateway_refund_id = get_gateway(payment.gateway).refund(payment.payment_id, part, {"booking": booking.code})
                row.status = Refund.Status.PROCESSED
            except GatewayError as exc:
                logger.error("Refund failed for %s: %s", booking.code, exc)
                row.status = Refund.Status.FAILED
            row.save(update_fields=["gateway_refund_id", "status"])
            if row.status == Refund.Status.PROCESSED:
                payment.refunded_amount += part
                payment.status = (
                    Payment.Status.REFUNDED if payment.refunded_amount >= payment.amount else Payment.Status.PARTIALLY_REFUNDED
                )
                payment.save(update_fields=["refunded_amount", "status", "updated_at"])
                remaining -= part
            created.append(row)
    if any(r.status == Refund.Status.FAILED for r in created):
        notify_admins("refund_failed", f"Refund failed · {booking.code}", "Retry from the admin console.", {"booking_id": booking.id})
    if sum(r.amount for r in created if r.status == Refund.Status.PROCESSED):
        done = sum(r.amount for r in created if r.status == Refund.Status.PROCESSED)
        notify(booking.traveler, "traveler", "refund_processed", f"Refund of ₹{done:,} started",
               f"{booking.code}: it reaches your account in 5–7 working days.", {"booking_id": booking.id})
    return created


def refundable_total(booking) -> int:
    agg = booking.payments.filter(
        status__in=[Payment.Status.CAPTURED, Payment.Status.PARTIALLY_REFUNDED]
    ).aggregate(a=Sum("amount"), r=Sum("refunded_amount"))
    return (agg["a"] or 0) - (agg["r"] or 0)


# ---------------------------------------------------------------- captain wallet
def credit_trip(booking):
    """BR-2: the Captain's share is credited only after the trip is completed."""
    try:
        with transaction.atomic():
            LedgerEntry.objects.create(
                captain=booking.captain, kind=LedgerEntry.Kind.TRIP_EARNING, amount=booking.captain_net,
                booking=booking, note=f"{booking.code} · {booking.service_snapshot.get('title', '')}"[:200],
            )
    except IntegrityError:
        pass  # already credited


def wallet(captain) -> dict:
    from apps.bookings.models import Booking

    entries = LedgerEntry.objects.filter(captain=captain)
    balance = entries.aggregate(s=Sum("amount"))["s"] or 0
    earned = entries.filter(kind=LedgerEntry.Kind.TRIP_EARNING).aggregate(s=Sum("amount"))["s"] or 0
    upcoming = Booking.objects.filter(
        captain=captain, status__in=[Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS]
    ).aggregate(s=Sum("captain_net"))["s"] or 0
    month_start = timezone.localdate().replace(day=1)
    this_month = entries.filter(kind=LedgerEntry.Kind.TRIP_EARNING, created_at__date__gte=month_start).aggregate(
        s=Sum("amount"))["s"] or 0
    paid_out = Payout.objects.filter(captain=captain, status=Payout.Status.PAID).aggregate(s=Sum("amount"))["s"] or 0
    in_transit = Payout.objects.filter(captain=captain, status=Payout.Status.REQUESTED).aggregate(s=Sum("amount"))["s"] or 0
    return {
        "available": balance,
        "pending_trips": upcoming,
        "this_month": this_month,
        "lifetime_earned": earned,
        "paid_out": paid_out,
        "in_transit": in_transit,
        "min_payout": settings.MIN_PAYOUT_AMOUNT,
        "on_hold": captain.is_on_hold,
    }


def request_payout(captain, amount: int) -> Payout:
    from apps.captains.models import CaptainProfile

    if amount < settings.MIN_PAYOUT_AMOUNT:
        raise bad_request(f"Minimum payout is ₹{settings.MIN_PAYOUT_AMOUNT:,}.", "below_minimum")
    account = getattr(captain, "payout_account", None)
    if account is None:
        raise bad_request("Add your UPI or bank details first.", "no_payout_account")
    with transaction.atomic():
        captain = CaptainProfile.objects.select_for_update().get(pk=captain.pk)
        if captain.is_on_hold:
            raise conflict("Payouts are paused while your account is on hold. Contact support.", "on_hold")
        balance = LedgerEntry.objects.filter(captain=captain).aggregate(s=Sum("amount"))["s"] or 0
        if amount > balance:
            raise bad_request(f"You can withdraw up to ₹{balance:,}.", "insufficient_balance")
        payout = Payout.objects.create(code=next_public_code("PO"), captain=captain, amount=amount, destination=account.masked)
        LedgerEntry.objects.create(captain=captain, kind=LedgerEntry.Kind.PAYOUT, amount=-amount, payout=payout,
                                   note=f"{payout.code} to {account.masked}"[:200])
    notify_admins("payout_requested", f"Payout {payout.code} · ₹{amount:,}", f"{captain.code} {captain.name}", {"payout_id": payout.id})
    return payout


def settle_payout(payout: Payout, paid: bool, reference: str, note: str, admin) -> Payout:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().select_related("captain__user").get(pk=payout.pk)
        if payout.status != Payout.Status.REQUESTED:
            raise conflict("This payout was already settled.", "already_settled")
        if paid and not reference.strip():
            raise bad_request("Enter the UTR / transfer reference.", "reference_required")
        payout.status = Payout.Status.PAID if paid else Payout.Status.FAILED
        payout.reference = reference.strip()[:64]
        payout.note = note[:300]
        payout.processed_by = admin
        payout.processed_at = timezone.now()
        payout.save()
        if not paid:
            LedgerEntry.objects.create(captain=payout.captain, kind=LedgerEntry.Kind.PAYOUT_REVERSAL, amount=payout.amount,
                                       payout=payout, note=f"{payout.code} failed: {note}"[:200])
    user = payout.captain.user
    if paid:
        notify(user, "captain", "payout_paid", f"₹{payout.amount:,} sent", f"{payout.code} · Ref {payout.reference}", {"payout_id": payout.id})
    else:
        notify(user, "captain", "payout_failed", "Payout failed — money is back in your wallet",
               note or "Check your bank details.", {"payout_id": payout.id})
    return payout
