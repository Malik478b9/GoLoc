from django.contrib import admin

from .models import LiveTripPing, SOSAlert


@admin.register(SOSAlert)
class SOSAlertAdmin(admin.ModelAdmin):
    list_display = ["booking", "status", "raised_by", "created_at"]
    list_filter = ["status"]


admin.site.register(LiveTripPing)
