import hashlib
import hmac
import json

from django.conf import settings
from django.http import HttpResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt

from apps.bookings.models import Booking
from apps.bookings.services import mark_booking_paid
from .models import Payment


def _valid_signature(body: bytes, signature: str) -> bool:
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@csrf_exempt
def razorpay_webhook(request):
    """
    POST endpoint Razorpay calls on payment/order events.
    Configure this URL in the Razorpay Dashboard under Webhooks, subscribed
    to `payment.captured` (drives BR-5: pay-to-protect activation).
    """
    if request.method != "POST":
        return HttpResponseBadRequest("POST only")

    signature = request.headers.get("X-Razorpay-Signature", "")
    if not _valid_signature(request.body, signature):
        return HttpResponseBadRequest("Invalid signature")

    payload = json.loads(request.body)
    event = payload.get("event")

    if event == "payment.captured":
        entity = payload["payload"]["payment"]["entity"]
        razorpay_order_id = entity["order_id"]
        razorpay_payment_id = entity["id"]

        try:
            payment = Payment.objects.select_related("booking").get(
                razorpay_order_id=razorpay_order_id
            )
        except Payment.DoesNotExist:
            return HttpResponse(status=200)  # ack — nothing to reconcile

        payment.razorpay_payment_id = razorpay_payment_id
        payment.status = Payment.Status.SUCCESS
        payment.save(update_fields=["razorpay_payment_id", "status"])

        mark_booking_paid(payment.booking)

    return HttpResponse(status=200)
