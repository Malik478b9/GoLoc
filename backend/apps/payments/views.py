from django.conf import settings
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import Booking
from . import razorpay_client
from .models import Payment, PayoutLedgerEntry
from .serializers import PayoutLedgerEntrySerializer


class CreateCheckoutOrderView(APIView):
    """
    POST /api/v1/payments/checkout/  { "booking_id": "..." }
    Creates a Razorpay Order for the Traveler's fare + insurance + tip
    (Section 3.4: Traveler money). The mobile app opens Razorpay Checkout
    with the returned order_id.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        booking = Booking.objects.get(pk=request.data["booking_id"], traveler=request.user)
        order = razorpay_client.create_order(booking.total_amount, receipt=booking.bkg_id)

        payment, _ = Payment.objects.update_or_create(
            booking=booking,
            defaults={
                "razorpay_order_id": order["id"],
                "amount": booking.total_amount,
                "status": Payment.Status.CREATED,
            },
        )
        return Response(
            {
                "razorpay_order_id": order["id"],
                "razorpay_key_id": settings.RAZORPAY_KEY_ID,
                "amount": str(booking.total_amount),
            },
            status=status.HTTP_201_CREATED,
        )


class MyPayoutLedgerView(APIView):
    """Captain's Earnings screen (Section 2.2 · 'Grow' group)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        entries = PayoutLedgerEntry.objects.filter(captain__user=request.user).order_by("-created_at")
        return Response(PayoutLedgerEntrySerializer(entries, many=True).data)
