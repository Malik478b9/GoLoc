from rest_framework import serializers

from apps.captains.models import PricingTier, Service
from .models import Booking, PackageBookingLineItem, Refund


class PackageBookingLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PackageBookingLineItem
        fields = ["category", "description", "cost"]


class RefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refund
        fields = ["refund_percentage", "refund_amount", "created_at"]


class BookingCreateSerializer(serializers.ModelSerializer):
    """
    Traveler-side 'Build My Trip' / booking request (Section 3.2, step 3).
    Fare and insurance are computed server-side from the Service's
    PricingTier — never trust a client-submitted price.
    """

    service_id = serializers.PrimaryKeyRelatedField(source="service", queryset=Service.objects.all())
    pricing_tier_id = serializers.PrimaryKeyRelatedField(
        source="pricing_tier", queryset=PricingTier.objects.all()
    )

    class Meta:
        model = Booking
        fields = [
            "id", "bkg_id", "service_id", "pricing_tier_id", "pax_count",
            "trip_start_date", "trip_end_date", "status",
        ]
        read_only_fields = ["id", "bkg_id", "status"]

    INSURANCE_RATE = 0.02  # per-booking insurance premium, illustrative (BR-6)

    def create(self, validated_data):
        pricing_tier = validated_data["pricing_tier"]
        pax_count = validated_data["pax_count"]
        fare = pricing_tier.price_per_person * pax_count

        booking = Booking.objects.create(
            traveler=self.context["request"].user,
            captain=pricing_tier.service.captain,
            fare_amount=fare,
            insurance_amount=round(fare * self.INSURANCE_RATE, 2),
            **validated_data,
        )
        return booking


class BookingSerializer(serializers.ModelSerializer):
    package_line_items = PackageBookingLineItemSerializer(many=True, read_only=True)
    refund = RefundSerializer(read_only=True)
    captain_cap_id = serializers.CharField(source="captain.cap_id", read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id", "bkg_id", "traveler", "captain", "captain_cap_id", "service", "pricing_tier",
            "pax_count", "trip_start_date", "trip_end_date", "fare_amount", "insurance_amount",
            "tip_amount", "total_amount", "commission_amount", "captain_net_amount",
            "status", "sos_active", "insurance_active", "package_line_items", "refund",
            "created_at", "paid_at", "completed_at", "cancelled_at",
        ]
        read_only_fields = fields
