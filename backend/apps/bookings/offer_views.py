"""
Traveler offers on a booking waiting for payment.

  GET    /bookings/<ref>/offers/   coupons (with what each takes off, or why not) and my gift vouchers
  POST   /bookings/<ref>/coupon/   {code}   → the re-priced booking
  DELETE /bookings/<ref>/coupon/
  POST   /bookings/<ref>/voucher/  {code}
  DELETE /bookings/<ref>/voucher/
  GET    /vouchers/                my gift vouchers (all, newest first)
"""
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsTraveler

from . import offers
from .serializers import BookingDetailSerializer
from .views import get_booking


def _detail(request, booking):
    booking = get_booking(request, booking.pk, for_update_detail=True)
    return Response(BookingDetailSerializer(booking, context={"request": request, "role": "traveler"}).data)


class OffersView(APIView):
    permission_classes = [IsTraveler]

    def get(self, request, ref):
        booking = get_booking(request, ref)
        return Response(offers.offers_for(booking))


class CouponView(APIView):
    permission_classes = [IsTraveler]
    throttle_scope = "coupon"

    def post(self, request, ref):
        return _detail(request, offers.apply_coupon(get_booking(request, ref), request.user, request.data.get("code", "")))

    def delete(self, request, ref):
        return _detail(request, offers.remove_coupon(get_booking(request, ref), request.user))


class VoucherView(APIView):
    permission_classes = [IsTraveler]
    throttle_scope = "coupon"

    def post(self, request, ref):
        return _detail(request, offers.apply_voucher(get_booking(request, ref), request.user, request.data.get("code", "")))

    def delete(self, request, ref):
        return _detail(request, offers.remove_voucher(get_booking(request, ref), request.user))


class MyVouchersView(APIView):
    permission_classes = [IsTraveler]

    def get(self, request):
        rows = offers.my_vouchers(request.user, usable_only=False).order_by("-created_at")[:50]
        return Response([offers.voucher_dict(v) for v in rows])
