from rest_framework import serializers

from .models import Payment, PayoutLedgerEntry


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "booking", "razorpay_order_id", "amount", "status", "created_at"]
        read_only_fields = fields


class PayoutLedgerEntrySerializer(serializers.ModelSerializer):
    booking_bkg_id = serializers.CharField(source="booking.bkg_id", read_only=True)

    class Meta:
        model = PayoutLedgerEntry
        fields = ["id", "booking_bkg_id", "amount", "status", "paid_out_at", "created_at"]
        read_only_fields = fields
