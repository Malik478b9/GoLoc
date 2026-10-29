from rest_framework import serializers

from apps.captains.models import CaptainProfile, Vehicle
from apps.captains.serializers import CATEGORIES, PayoutAccountSerializer, ServiceSerializer, VehicleSerializer
from apps.cities.models import City

from .models import Agency, AgencyDocument, AgencyInvite, AgencyPayoutAccount, AgencyService


class AgencySerializer(serializers.ModelSerializer):
    city_id = serializers.PrimaryKeyRelatedField(source="city", queryset=City.objects.filter(is_live=True))
    city_name = serializers.CharField(source="city.name", read_only=True)
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    owner_phone = serializers.CharField(source="owner.phone_number", read_only=True)

    class Meta:
        model = Agency
        fields = ["id", "code", "name", "legal_name", "city_id", "city_name", "address", "gstin", "pan", "contact_email", "logo",
                  "owner_name", "owner_phone", "review_status", "review_note", "submitted_at", "reviewed_at", "is_on_hold",
                  "hold_reason", "created_at"]
        read_only_fields = ["id", "code", "logo", "review_status", "review_note", "submitted_at", "reviewed_at", "is_on_hold",
                            "hold_reason", "created_at"]

    def validate_gstin(self, value):
        value = value.strip().upper()
        if value and (len(value) != 15 or not value.isalnum()):
            raise serializers.ValidationError("A GSTIN has 15 letters and digits, e.g. 36ABCDE1234F1Z5.")
        return value

    def validate_pan(self, value):
        value = value.strip().upper()
        if value and (len(value) != 10 or not value[:5].isalpha() or not value[5:9].isdigit() or not value[9].isalpha()):
            raise serializers.ValidationError("Enter a valid PAN, e.g. ABCDE1234F.")
        return value

    def validate(self, attrs):
        # Business details are locked while GoLoc reviews them and after approval (support can change them).
        if self.instance and self.instance.review_status in {Agency.ReviewStatus.PENDING, Agency.ReviewStatus.APPROVED}:
            locked = {"legal_name", "gstin", "pan"} & {k for k, v in attrs.items() if getattr(self.instance, k) != v}
            if locked:
                raise serializers.ValidationError({sorted(locked)[0]: "Locked after submission. Contact GoLoc support to change it."})
        return attrs


class AgencyDocumentSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.CharField(source="get_doc_type_display", read_only=True)

    class Meta:
        model = AgencyDocument
        fields = ["id", "doc_type", "doc_type_label", "file", "number", "status", "note", "reviewed_at", "created_at"]
        read_only_fields = ["id", "status", "note", "reviewed_at", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}


class AgencyPayoutAccountSerializer(PayoutAccountSerializer):
    class Meta(PayoutAccountSerializer.Meta):
        model = AgencyPayoutAccount


class InviteSerializer(serializers.ModelSerializer):
    captain = serializers.SerializerMethodField()

    class Meta:
        model = AgencyInvite
        fields = ["id", "phone_number", "status", "captain", "responded_at", "created_at"]

    def get_captain(self, obj):
        c = CaptainProfile.objects.filter(user__phone_number=obj.phone_number).select_related("user").first()
        return {"code": c.code, "name": c.name} if c else None


class AgencyCaptainSerializer(serializers.ModelSerializer):
    """One of the agency's Captains, with how they're doing (annotated in the view)."""

    name = serializers.CharField(read_only=True)
    phone = serializers.CharField(source="user.phone_number", read_only=True)
    city_name = serializers.CharField(source="city.name", read_only=True)
    month_earned = serializers.IntegerField(read_only=True, default=0)
    upcoming = serializers.IntegerField(read_only=True, default=0)
    vehicles = serializers.SerializerMethodField()
    kyc_ok = serializers.SerializerMethodField()

    class Meta:
        model = CaptainProfile
        fields = ["id", "code", "name", "phone", "avatar", "city_name", "captain_type", "review_status", "is_live", "is_on_hold",
                  "rating_avg", "rating_count", "trips_completed", "years_experience", "agency_joined_at", "month_earned",
                  "upcoming", "vehicles", "kyc_ok"]

    def get_vehicles(self, obj):
        return [f"{v.make_model} · {v.registration_number}" for v in obj.vehicles.all() if v.is_active]

    def get_kyc_ok(self, obj):
        return obj.review_status == CaptainProfile.ReviewStatus.APPROVED


class AgencyServiceSerializer(ServiceSerializer):
    city_id = serializers.PrimaryKeyRelatedField(source="city", queryset=City.objects.filter(is_live=True), allow_null=True,
                                                 required=False)
    city_name = serializers.CharField(source="city.name", read_only=True, default=None)
    captains_offering = serializers.SerializerMethodField()

    class Meta(ServiceSerializer.Meta):
        model = AgencyService
        fields = [f for f in ServiceSerializer.Meta.fields if f != "managed_by_agency"] + ["city_id", "city_name", "captains_offering"]

    def get_captains_offering(self, obj):
        return obj.copies.filter(is_active=True).count()

    def validate_category(self, value):
        if value not in CATEGORIES:
            raise serializers.ValidationError("Choose a listed category.")
        return value


class AgencyVehicleSerializer(VehicleSerializer):
    captain_id = serializers.PrimaryKeyRelatedField(source="captain", queryset=CaptainProfile.objects.all(), allow_null=True,
                                                    required=False)
    captain_name = serializers.CharField(source="captain.name", read_only=True, default=None)

    class Meta(VehicleSerializer.Meta):
        model = Vehicle
        fields = [f for f in VehicleSerializer.Meta.fields if f != "agency_owned"] + ["captain_id", "captain_name"]

    def validate_captain_id(self, captain):
        agency = self.context["agency"]
        if captain is not None and captain.agency_id != agency.id:
            raise serializers.ValidationError("Assign the car to one of your own Captains.")
        return captain

