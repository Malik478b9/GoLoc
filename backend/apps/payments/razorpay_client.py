"""
Thin wrapper around the Razorpay SDK (Section 5: Payments / Marketplace payouts).

Route (marketplace payouts) requires each Captain to be onboarded as a
"linked account" with Razorpay before transfers can be created — see the
note in Section 8 of the technical specification about starting this
onboarding early, since it has the longest external lead time in the plan.
"""
import razorpay
from django.conf import settings


def _client() -> razorpay.Client:
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def create_order(amount_rupees, receipt: str) -> dict:
    """Amount is in rupees; Razorpay expects paise."""
    return _client().order.create(
        {
            "amount": int(amount_rupees * 100),
            "currency": "INR",
            "receipt": receipt,
            "payment_capture": 1,
        }
    )


def verify_payment_signature(params: dict) -> bool:
    try:
        _client().utility.verify_payment_signature(params)
        return True
    except razorpay.errors.SignatureVerificationError:
        return False


def create_route_transfer(payment_id: str, linked_account_id: str, amount_rupees) -> dict:
    """
    Splits a captured payment to a Captain's linked account (Razorpay Route).
    Called only once a booking is COMPLETED (BR-2) — see
    apps.bookings.services.complete_booking and the payout task below.
    """
    return _client().payment.transfer(
        payment_id,
        {
            "transfers": [
                {
                    "account": linked_account_id,
                    "amount": int(amount_rupees * 100),
                    "currency": "INR",
                    "on_hold": False,
                }
            ]
        },
    )


def create_refund(payment_id: str, amount_rupees) -> dict:
    return _client().payment.refund(payment_id, {"amount": int(amount_rupees * 100)})
