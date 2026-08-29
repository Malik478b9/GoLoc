from django.contrib import admin

from .models import Payment, PayoutLedgerEntry


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["booking", "amount", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["booking__bkg_id", "razorpay_order_id", "razorpay_payment_id"]


@admin.register(PayoutLedgerEntry)
class PayoutLedgerEntryAdmin(admin.ModelAdmin):
    # BR-7 style lookup + Ops/Finance reconciliation (Section 2.3, Admin module)
    list_display = ["captain", "booking", "amount", "status", "paid_out_at"]
    list_filter = ["status"]
    search_fields = ["captain__cap_id", "booking__bkg_id"]
