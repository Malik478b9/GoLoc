from django.contrib import admin

from .models import Availability, CaptainProfile, PackageLineItem, PricingTier, Service, Vehicle


@admin.register(CaptainProfile)
class CaptainProfileAdmin(admin.ModelAdmin):
    # BR-7: Admin ID lookup by CAP-ID
    list_display = ["cap_id", "business_name", "home_city", "verification_status", "lifecycle_status"]
    list_filter = ["verification_status", "lifecycle_status", "home_city"]
    search_fields = ["cap_id", "business_name", "user__phone_number"]


admin.site.register(Vehicle)
admin.site.register(Service)
admin.site.register(PricingTier)
admin.site.register(PackageLineItem)
admin.site.register(Availability)
