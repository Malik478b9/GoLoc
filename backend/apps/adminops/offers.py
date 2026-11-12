"""
Admin: coupons and gift vouchers.

  GET/POST  /admin/coupons/              list (with uses and total discount) · create
  PATCH     /admin/coupons/<id>/         edit, pause/resume
  GET/POST  /admin/vouchers/?q=          list · send to one or more mobile numbers
  POST      /admin/vouchers/<id>/cancel/ stop it (balance can't be used any more)
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import IsAdmin
from apps.accounts.phone import InvalidPhoneNumber, normalize_phone
from apps.bookings.models import Booking, Coupon, GiftVoucher
from apps.bookings.offers import HOLDING
from apps.common.api import bad_request
from apps.notifications.service import notify

from .models import audit

USED = Q(bookings__status__in=HOLDING) | Q(bookings__status=Booking.Status.CANCELLED, bookings__confirmed_at__isnull=False)
PAID = Q(bookings__confirmed_at__isnull=False)


class CouponSerializer(serializers.ModelSerializer):
    uses = serializers.IntegerField(read_only=True, default=0)
    paid_uses = serializers.IntegerField(read_only=True, default=0)
    total_discount = serializers.IntegerField(read_only=True, default=0)
    city_name = serializers.CharField(source="city.name", read_only=True, default=None)
    captain_code = serializers.CharField(source="captain.code", read_only=True, default=None)

    class Meta:
        model = Coupon
        fields = ["id", "code", "title", "description", "kind", "value", "max_discount", "min_fare", "min_guests", "starts_at",
                  "ends_at", "max_uses", "per_user_limit", "first_trip_only", "auto_apply", "is_public", "is_active", "city",
                  "city_name", "captain", "captain_code", "trip_kind", "uses", "paid_uses", "total_discount", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_code(self, v):
        v = v.strip().upper()
        if not v.replace("-", "").replace("_", "").isalnum() or len(v) < 3:
            raise serializers.ValidationError("Use 3–20 letters and numbers, e.g. DIWALI500.")
        return v

    def validate(self, d):
        kind = d.get("kind", getattr(self.instance, "kind", "percent"))
        value = d.get("value", getattr(self.instance, "value", 0))
        if kind == "percent" and not 1 <= value <= 100:
            raise serializers.ValidationError({"value": "A percent coupon is 1–100%."})
        starts, ends = d.get("starts_at", getattr(self.instance, "starts_at", None)), d.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": "The end must be after the start."})
        return d


def _coupons():
    return Coupon.objects.select_related("city", "captain").annotate(
        uses=Count("bookings", filter=USED, distinct=True),
        paid_uses=Count("bookings", filter=PAID, distinct=True),
        total_discount=Coalesce(Sum("bookings__discount", filter=PAID), 0),
    )


class CouponListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(CouponSerializer(_coupons(), many=True).data)

    def post(self, request):
        s = CouponSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if Coupon.objects.filter(code=s.validated_data["code"]).exists():
            raise bad_request("That code is already taken.", "code_taken")
        coupon = s.save(created_by=request.user)
        audit(request.user, "coupon_create", coupon, label=coupon.code)
        return Response(CouponSerializer(_coupons().get(pk=coupon.pk)).data, status=status.HTTP_201_CREATED)


class CouponDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        coupon = get_object_or_404(Coupon, pk=pk)
        s = CouponSerializer(coupon, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        if "code" in s.validated_data and Coupon.objects.filter(code=s.validated_data["code"]).exclude(pk=pk).exists():
            raise bad_request("That code is already taken.", "code_taken")
        coupon = s.save()
        audit(request.user, "coupon_update", coupon, label=coupon.code, changes={k: str(v) for k, v in s.validated_data.items()})
        return Response(CouponSerializer(_coupons().get(pk=coupon.pk)).data)


# ---------------------------------------------------------------- gift vouchers
class VoucherSerializer(serializers.ModelSerializer):
    holder = serializers.SerializerMethodField()
    used = serializers.SerializerMethodField()

    class Meta:
        model = GiftVoucher
        fields = ["id", "code", "phone_number", "holder", "amount", "balance", "used", "message", "expires_at", "status",
                  "created_at"]

    def get_holder(self, obj):
        return self.context.get("names", {}).get(obj.phone_number)

    def get_used(self, obj):
        return obj.amount - obj.balance


def _names(phones):
    return dict(User.objects.filter(phone_number__in=set(phones)).values_list("phone_number", "full_name"))


class VoucherListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = GiftVoucher.objects.all()
        q = request.query_params.get("q", "").strip()
        if q:
            digits = "".join(ch for ch in q if ch.isdigit())
            qs = qs.filter(Q(code__icontains=q) | (Q(phone_number__endswith=digits[-10:]) if len(digits) >= 4 else Q(pk__in=[])))
        rows = list(qs[:200])
        return Response(VoucherSerializer(rows, many=True, context={"names": _names(r.phone_number for r in rows)}).data)

    def post(self, request):
        """{phones: "98xxx, 97xxx" or [..], amount, valid_days (default 365), message}"""
        raw = request.data.get("phones", "")
        items = raw if isinstance(raw, list) else str(raw).replace("\n", ",").replace(";", ",").split(",")
        phones, bad = [], []
        for item in (str(x).strip() for x in items):
            if not item:
                continue
            try:
                phones.append(normalize_phone(item))
            except InvalidPhoneNumber:
                bad.append(item)
        if bad:
            raise bad_request(f"Not a valid mobile number: {', '.join(bad[:5])}", "bad_phone")
        phones = list(dict.fromkeys(phones))
        if not phones:
            raise bad_request("Add at least one mobile number.", "phones_required")
        if len(phones) > 200:
            raise bad_request("Up to 200 numbers at a time.", "too_many")
        try:
            amount = int(request.data.get("amount") or 0)
            days = int(request.data.get("valid_days") or 365)
        except (TypeError, ValueError):
            raise bad_request("Amount and validity must be numbers.", "invalid")
        if not 1 <= amount <= 100000:
            raise bad_request("Amount must be between ₹1 and ₹1,00,000.", "bad_amount")
        if not 1 <= days <= 3650:
            raise bad_request("Validity must be 1 to 3,650 days.", "bad_days")
        message = str(request.data.get("message", "")).strip()[:200]
        expires = timezone.now() + timedelta(days=days)
        with transaction.atomic():
            made = [GiftVoucher.objects.create(phone_number=p, amount=amount, balance=amount, message=message, expires_at=expires,
                                               created_by=request.user) for p in phones]
            audit(request.user, "voucher_create", made[0], label=f"₹{amount:,} × {len(made)}", phones=phones)
        users = {u.phone_number: u for u in User.objects.filter(phone_number__in=phones)}
        for v in made:
            u = users.get(v.phone_number)
            if u:
                notify(u, "traveler", "voucher_received", f"You've got a ₹{amount:,} GoLoc gift voucher 🎁",
                       (message + " " if message else "") + f"Use it on any trip before {timezone.localtime(expires):%d %b %Y}.",
                       {"voucher": v.code})
        return Response(VoucherSerializer(made, many=True, context={"names": _names(phones)}).data, status=status.HTTP_201_CREATED)


class VoucherCancelView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        v = get_object_or_404(GiftVoucher, pk=pk)
        if v.status != GiftVoucher.Status.CANCELLED:
            v.status = GiftVoucher.Status.CANCELLED
            v.save(update_fields=["status", "updated_at"])
            audit(request.user, "voucher_cancel", v, label=v.code)
        return Response(VoucherSerializer(v, context={"names": _names([v.phone_number])}).data)
