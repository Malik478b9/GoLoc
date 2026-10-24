"""Django admin (/django-admin/) — a raw data fallback for superusers. Day-to-day ops use admin-desk."""
from django.contrib import admin

from apps.bookings.models import Booking, BookingEvent
from apps.captains.models import CaptainProfile, ServiceOffer, VerificationDocument
from apps.payments.models import LedgerEntry, Payment, Payout, Refund
from apps.reviews.models import Review
from apps.social.models import Post
from apps.support.models import Ticket
from apps.trips.models import EmergencyService, SOSAlert

from .models import AdminAction


@admin.register(CaptainProfile)
class CaptainProfileAdmin(admin.ModelAdmin):
    list_display = ["code", "user", "city", "review_status", "is_live", "is_on_hold", "rating_avg", "trips_completed"]
    list_filter = ["review_status", "is_live", "is_on_hold", "city"]
    search_fields = ["code", "user__full_name", "user__phone_number"]
    raw_id_fields = ["user"]


class EventInline(admin.TabularInline):
    model = BookingEvent
    extra = 0
    readonly_fields = ["kind", "message", "actor_role", "created_at"]


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ["code", "status", "captain", "traveler", "start_date", "total"]
    list_filter = ["status", "kind", "city"]
    search_fields = ["code", "captain__code", "traveler__phone_number"]
    raw_id_fields = ["traveler", "captain", "service"]
    inlines = [EventInline]


for model, fields in [
    (ServiceOffer, ["title", "captain", "kind", "category", "is_active"]),
    (VerificationDocument, ["captain", "doc_type", "status", "created_at"]),
    (Payment, ["order_id", "booking", "amount", "status", "gateway", "created_at"]),
    (Refund, ["booking", "amount", "status", "created_at"]),
    (Payout, ["code", "captain", "amount", "status", "created_at"]),
    (LedgerEntry, ["captain", "kind", "amount", "created_at"]),
    (SOSAlert, ["code", "booking", "role", "status", "created_at"]),
    (EmergencyService, ["name", "phone", "kind", "city"]),
    (Review, ["booking", "captain", "rating", "is_hidden"]),
    (Post, ["captain", "kind", "status", "view_count", "created_at"]),
    (Ticket, ["code", "category", "status", "created_at"]),
    (AdminAction, ["actor", "action", "target_type", "target_label", "created_at"]),
]:
    admin.site.register(model, list_display=fields)
