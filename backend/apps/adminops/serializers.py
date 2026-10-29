from rest_framework import serializers

from apps.accounts.models import User
from apps.bookings.serializers import BookingDetailSerializer, BookingListSerializer
from apps.captains.models import CaptainProfile
from apps.captains.serializers import DocumentSerializer, PublicServiceSerializer, PublicVehicleSerializer
from apps.cities.models import City
from apps.payments.models import Payment, Payout, Refund
from apps.reviews.models import Review
from apps.social.models import Post
from apps.support.models import Ticket
from apps.trips.models import EmergencyService, SOSAlert

from .models import AdminAction


class AdminCaptainRowSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    phone = serializers.CharField(source="user.phone_number", read_only=True)
    city_name = serializers.CharField(source="city.name", read_only=True)

    class Meta:
        model = CaptainProfile
        fields = ["id", "code", "name", "phone", "avatar", "city_name", "captain_type", "review_status", "is_live", "is_on_hold",
                  "is_featured", "is_verified", "rating_avg", "rating_count", "trips_completed", "submitted_at", "last_active_at", "created_at"]


class AdminDocumentSerializer(DocumentSerializer):
    captain_code = serializers.CharField(source="captain.code", read_only=True)
    captain_name = serializers.CharField(source="captain.name", read_only=True)
    file_path = serializers.SerializerMethodField(help_text="Authenticated download, relative to the API root.")

    class Meta(DocumentSerializer.Meta):
        fields = DocumentSerializer.Meta.fields + ["captain_code", "captain_name", "file_path"]

    def get_file_path(self, obj):
        return f"/admin/documents/{obj.pk}/file/"


class AdminCaptainDetailSerializer(AdminCaptainRowSerializer):
    documents = AdminDocumentSerializer(many=True, read_only=True)
    services = PublicServiceSerializer(many=True, read_only=True)
    vehicles = serializers.SerializerMethodField()
    payout_account = serializers.SerializerMethodField()

    class Meta(AdminCaptainRowSerializer.Meta):
        fields = AdminCaptainRowSerializer.Meta.fields + [
            "tagline", "bio", "years_experience", "languages", "categories", "max_bookings_per_day", "review_note",
            "hold_reason", "reviewed_at", "profile_views", "documents", "services", "vehicles", "payout_account"]

    def get_vehicles(self, obj):
        return [{**PublicVehicleSerializer(v).data, "registration_number": v.registration_number, "is_active": v.is_active}
                for v in obj.vehicles.all()]

    def get_payout_account(self, obj):
        acct = getattr(obj, "payout_account", None)
        if not acct:
            return None
        # Admin needs the full details to pay out manually.
        return {"method": acct.method, "account_holder": acct.account_holder, "upi_id": acct.upi_id,
                "account_number": acct.account_number, "ifsc": acct.ifsc}


class AdminBookingRowSerializer(BookingListSerializer):
    class Meta(BookingListSerializer.Meta):
        fields = BookingListSerializer.Meta.fields + ["commission", "insurance_fee"]


class PaymentSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.code", read_only=True)

    class Meta:
        model = Payment
        fields = ["id", "booking_code", "gateway", "order_id", "payment_id", "amount", "refunded_amount", "status",
                  "method", "error", "captured_at", "created_at"]


class RefundSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.code", read_only=True)

    class Meta:
        model = Refund
        fields = ["id", "booking_code", "amount", "reason", "gateway_refund_id", "status", "created_at"]


class AdminBookingDetailSerializer(BookingDetailSerializer):
    payments = PaymentSerializer(many=True, read_only=True)
    refunds_list = RefundSerializer(source="refunds", many=True, read_only=True)
    sos = serializers.SerializerMethodField()

    class Meta(BookingDetailSerializer.Meta):
        fields = BookingDetailSerializer.Meta.fields + ["payments", "refunds_list", "sos", "captain_net", "insurance_premium",
                                                        "share_token"]

    def get_sos(self, obj):
        return list(obj.sos_alerts.values("id", "code", "status", "created_at"))


class AdminPayoutSerializer(serializers.ModelSerializer):
    # The payee: a Captain or an agency (kept under the captain_* names the console already reads).
    captain_code = serializers.CharField(source="payee_code", read_only=True)
    captain_name = serializers.CharField(source="payee_name", read_only=True)
    is_agency = serializers.SerializerMethodField()
    processed_by_name = serializers.CharField(source="processed_by.full_name", read_only=True, default=None)

    class Meta:
        model = Payout
        fields = ["id", "code", "captain_code", "captain_name", "is_agency", "amount", "status", "destination", "reference", "note",
                  "processed_by_name", "processed_at", "created_at"]

    def get_is_agency(self, obj):
        return obj.agency_id is not None


class SOSSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.code", read_only=True)
    raised_by_name = serializers.CharField(source="raised_by.full_name", read_only=True)
    raised_by_phone = serializers.CharField(source="raised_by.phone_number", read_only=True)
    city_name = serializers.CharField(source="booking.city.name", read_only=True)

    class Meta:
        model = SOSAlert
        fields = ["id", "code", "booking_code", "role", "raised_by_name", "raised_by_phone", "city_name", "lat", "lng",
                  "message", "status", "notes", "acknowledged_at", "resolved_at", "created_at"]


class TicketAdminSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.code", read_only=True, default=None)
    raised_by_name = serializers.CharField(source="raised_by.full_name", read_only=True)
    raised_by_phone = serializers.CharField(source="raised_by.phone_number", read_only=True)

    class Meta:
        model = Ticket
        fields = ["id", "code", "role", "category", "subject", "description", "status", "resolution", "refund_amount",
                  "booking_code", "raised_by_name", "raised_by_phone", "created_at", "resolved_at"]


class ReviewAdminSerializer(serializers.ModelSerializer):
    captain_code = serializers.CharField(source="captain.code", read_only=True)
    traveler_name = serializers.CharField(source="traveler.full_name", read_only=True)
    booking_code = serializers.CharField(source="booking.code", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "rating", "comment", "captain_reply", "is_hidden", "hidden_reason", "captain_code", "traveler_name",
                  "booking_code", "created_at"]


class PostAdminSerializer(serializers.ModelSerializer):
    captain_code = serializers.CharField(source="captain.code", read_only=True)
    captain_name = serializers.CharField(source="captain.name", read_only=True)

    class Meta:
        model = Post
        fields = ["id", "kind", "media", "thumbnail", "caption", "status", "moderation_note", "captain_code",
                  "captain_name", "like_count", "view_count", "created_at"]


class UserAdminSerializer(serializers.ModelSerializer):
    captain_code = serializers.CharField(source="captain_profile.code", read_only=True, default=None)

    class Meta:
        model = User
        fields = ["id", "phone_number", "full_name", "email", "role", "is_active", "is_staff", "captain_code",
                  "last_login", "created_at"]


class CityAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ["id", "name", "slug", "state", "is_live", "latitude", "longitude", "launch_phase", "sort_order"]


class EmergencyAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyService
        fields = ["id", "city", "kind", "name", "phone", "address", "lat", "lng", "sort_order"]


class AuditSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)

    class Meta:
        model = AdminAction
        fields = ["id", "actor_name", "action", "target_type", "target_id", "target_label", "data", "created_at"]

