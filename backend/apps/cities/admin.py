from django.contrib import admin

from .models import City


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ["name", "state", "is_live", "launch_phase", "sort_order"]
    list_filter = ["is_live", "launch_phase", "state"]
    list_editable = ["is_live", "sort_order"]
    search_fields = ["name", "state"]
    prepopulated_fields = {"slug": ("name",)}
