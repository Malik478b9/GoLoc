from django.utils import timezone
from rest_framework import serializers

from apps.captains.models import ServiceOffer
from apps.common.api import public_url

from .models import Booking, BookingEvent


def mask_phone(number: str) -> str:
    """+919876543210 → +91 98••• ••210"""
    digits = number[-10:]
    return f"+91 {digits[:2]}••• ••{digits[-3:]}" if len(digits) == 10 else "••••••"


def _abs(request, field):
    if not field:
        return None
    return request.build_absolute_uri(field.url) if request else field.url


class BookingListSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    captain = serializers.SerializerMethodField()
    traveler = serializers.SerializerMethodField()
    city_name = serializers.CharField(source="city.name", read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True, default=None)
    group = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ["id", "code", "status", "status_label", "kind", "tier", "guests", "start_date", "end_date",
                  "start_time", "title", "captain", "traveler", "city_name", "agency_name", "fare", "total", "captain_net",
                  "request_expires_at", "payment_due_at", "created_at", "group", "discount", "voucher_amount", "coupon"]

    coupon = serializers.SerializerMethodField()

    def get_coupon(self, obj):
        c = obj.coupon
        return {"code": c.code, "title": c.title} if c else None

    def get_group(self, obj):
        """Set when this booking is seats on a group departure shared with other travelers."""
        g = obj.group
        if g is None:
            return None
        out = {"id": g.id, "code": g.code, "title": g.title, "price_per_seat": g.price_per_seat}
        if self.context.get("detail"):
            out.update(seats=g.seats, min_seats=g.min_seats, seats_taken=g.seats_taken(), seats_paid=g.seats_paid(),
                       status=g.status)
        return out

    @property
    def role(self):
        return self.context.get("role")

    def get_title(self, obj):
        return obj.service_snapshot.get("title") or obj.service.title

    def get_captain(self, obj):
        c = obj.captain
        out = {"id": c.id, "code": c.code, "name": c.name, "avatar": _abs(self.context.get("request"), c.avatar)}
        if self.role in {"admin"} or (self.role == "traveler" and obj.is_paid):
            out["phone"] = c.user.phone_number
        return out

    def get_traveler(self, obj):
        """Captains see the traveler's name only. Their number needs a paid booking and the traveler's consent."""
        t = obj.traveler
        out = {"id": t.id, "name": t.full_name or "Traveler"}
        # An agency sees what its Captain sees.
        if self.role == "admin" or (self.role in {"captain", "agency"} and obj.is_paid and obj.traveler_shares_contact):
            out["phone"] = t.phone_number
        elif self.role in {"captain", "agency"}:
            out.pop("id")
            out["phone_masked"] = mask_phone(t.phone_number)
        return out

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if self.role == "traveler":
            data.pop("captain_net", None)
        elif self.role in {"captain", "agency"}:
            # GoLoc pays for offers; the Captain's share doesn't change, so they don't need to see them.
            for k in ("discount", "voucher_amount", "coupon"):
                data.pop(k, None)
        return data


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingEvent
        fields = ["kind", "message", "actor_role", "created_at"]


class BookingDetailSerializer(BookingListSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.context["detail"] = True

    events = EventSerializer(many=True, read_only=True)
    actions = serializers.SerializerMethodField()
    start_pin = serializers.SerializerMethodField()
    end_pin = serializers.SerializerMethodField()
    can_complete_from = serializers.DateField(source="end_date", read_only=True)
    share_url = serializers.SerializerMethodField()
    review = serializers.SerializerMethodField()
    refunded = serializers.SerializerMethodField()
    service_id = serializers.UUIDField(source="service.id", read_only=True)
    itinerary = serializers.SerializerMethodField()
    guest_details = serializers.SerializerMethodField()

    class Meta(BookingListSerializer.Meta):
        fields = BookingListSerializer.Meta.fields + [
            "service_id", "meeting_point", "note", "service_snapshot", "insurance_fee", "insurance_policy_no", "commission",
            "cancelled_by", "cancel_reason", "refund_percent", "refunded", "accepted_at", "confirmed_at", "started_at",
            "completed_at", "cancelled_at", "start_pin", "end_pin", "can_complete_from", "share_url", "review", "itinerary", "guest_details", "traveler_shares_contact", "events", "actions",
        ]

    def get_start_pin(self, obj):
        return obj.start_pin if self.role == "traveler" and obj.status == Booking.Status.CONFIRMED else None

    def get_end_pin(self, obj):
        # Only the traveler sees it, only during the trip, and only from the last booked day.
        if self.role == "traveler" and obj.status == Booking.Status.IN_PROGRESS and timezone.localdate() >= obj.end_date:
            return obj.end_pin or None
        return None

    def get_share_url(self, obj):
        if self.role == "traveler" and obj.status in {Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS}:
            return public_url(self.context.get("request"), f"/t/{obj.share_token}/")
        return None

    def get_itinerary(self, obj):
        """Traveler: the plan their Captain shared. Captain: their latest one for this trip, shared or not."""
        from apps.itineraries.models import Itinerary
        from apps.itineraries.serializers import ItinerarySummarySerializer

        qs = obj.itineraries.filter(kind=Itinerary.Kind.CUSTOM)
        if self.role == "traveler":
            qs = qs.filter(is_published=True, status=Itinerary.Status.READY)
        it = qs.order_by("-updated_at").first()
        return ItinerarySummarySerializer(it, context=self.context).data if it else None

    def get_guest_details(self, obj):
        """Traveler and admin see every guest's mobile; Captains and agencies see names only (privacy policy)."""
        guests = obj.guest_details or []
        if self.role in {"traveler", "admin"}:
            return guests
        return [{"name": g.get("name", "")} for g in guests]

    def get_review(self, obj):
        review = getattr(obj, "review", None)
        if review is None:
            return None
        return {"rating": review.rating, "comment": review.comment, "captain_reply": review.captain_reply}

    def get_refunded(self, obj):
        return sum(r.amount for r in obj.refunds.all() if r.status == "processed")

    def get_actions(self, obj):
        S = Booking.Status
        s = obj.status
        last_day = timezone.localdate() >= obj.end_date
        if self.role == "captain":
            return {
                "accept": s == S.REQUESTED, "decline": s == S.REQUESTED, "cancel": s in (S.ACCEPTED, S.CONFIRMED),
                "start": s == S.CONFIRMED, "complete": s == S.IN_PROGRESS and last_day, "track": s in (S.CONFIRMED, S.IN_PROGRESS),
                "message": True,
            }
        if self.role == "traveler":
            return {
                "pay": s == S.ACCEPTED, "cancel": s in (S.REQUESTED, S.ACCEPTED, S.CONFIRMED),
                "track": s in (S.CONFIRMED, S.IN_PROGRESS), "sos": s in (S.CONFIRMED, S.IN_PROGRESS),
                "review": s == S.COMPLETED and getattr(obj, "review", None) is None, "message": True,
                "share_contact": s in (S.CONFIRMED, S.IN_PROGRESS),
                "complete": s == S.IN_PROGRESS and last_day,
            }
        return {}

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if self.role != "admin":
            data.pop("commission", None)
        return data


class BookingCreateSerializer(serializers.Serializer):
    service_id = serializers.PrimaryKeyRelatedField(
        queryset=ServiceOffer.objects.select_related("captain__user", "captain__city"), source="service"
    )
    tier = serializers.ChoiceField(choices=["standard", "normal", "medium", "lavish"], required=False, default="standard")
    guests = serializers.IntegerField(min_value=1, max_value=20)
    start_date = serializers.DateField(help_text="Arrival / first day.")
    end_date = serializers.DateField(required=False, allow_null=True, help_text="Return / last day (guide hire).")
    start_time = serializers.TimeField(required=False, allow_null=True)
    meeting_point = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    guest_details = serializers.ListField(
        child=serializers.DictField(), required=False, allow_null=True, max_length=20,
        help_text='[{"name", "phone"}] — one per guest, guest 1 first (the traveler).',
    )
