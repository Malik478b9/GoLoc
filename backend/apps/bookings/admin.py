from django.contrib import admin

from .models import Booking, CancellationPolicy, PackageBookingLineItem, Refund


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    # BR-7: Admin BKG-ID search
    list_display = ["bkg_id", "traveler", "captain", "status", "fare_amount", "created_at"]
    list_filter = ["status"]
    search_fields = ["bkg_id", "traveler__phone_number", "captain__cap_id"]


admin.site.register(CancellationPolicy)
admin.site.register(Refund)
admin.site.register(PackageBookingLineItem)
