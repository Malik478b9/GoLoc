from django.contrib import admin

from .models import AuditLog, Dispute, Incident, Promotion


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ["booking", "severity", "status", "assigned_admin", "created_at"]
    list_filter = ["severity", "status"]


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = ["booking", "status", "raised_by", "created_at"]
    list_filter = ["status"]


admin.site.register(AuditLog)
admin.site.register(Promotion)
