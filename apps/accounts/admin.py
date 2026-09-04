from django.contrib import admin

from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["phone_number", "full_name", "role", "phone_verified", "created_at"]
    list_filter = ["role", "phone_verified"]
    search_fields = ["phone_number", "full_name"]
