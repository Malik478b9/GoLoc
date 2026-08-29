from django.contrib import admin

from .models import City


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ["name", "state", "is_live", "launch_phase"]
    list_filter = ["is_live", "launch_phase"]
    search_fields = ["name"]
