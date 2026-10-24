from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import OTPChallenge, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["-created_at"]
    list_display = ["phone_number", "full_name", "role", "city", "is_staff", "is_active", "created_at"]
    list_filter = ["role", "is_staff", "is_active", "phone_verified", "city"]
    search_fields = ["phone_number", "full_name", "email"]
    readonly_fields = ["created_at", "last_login", "date_joined"]
    fieldsets = (
        (None, {"fields": ("phone_number", "password")}),
        ("Profile", {"fields": ("full_name", "email", "city", "role", "phone_verified")}),
        ("Access", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined", "created_at")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("phone_number", "full_name", "is_staff")}),
    )

    def save_model(self, request, obj, form, change):
        if not change and not obj.has_usable_password():
            obj.set_unusable_password()
        super().save_model(request, obj, form, change)


@admin.register(OTPChallenge)
class OTPChallengeAdmin(admin.ModelAdmin):
    """Read-only audit trail of codes sent — useful when someone says 'I never got the SMS'."""

    list_display = ["phone_number", "provider", "created_at", "expires_at", "attempts", "consumed_at", "request_ip"]
    list_filter = ["provider"]
    search_fields = ["phone_number"]
    readonly_fields = [f.name for f in OTPChallenge._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
