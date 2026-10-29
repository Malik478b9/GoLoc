from rest_framework import serializers

from apps.cities.models import City

from .models import (BlockedDate, CaptainProfile, PayoutAccount, ServiceOffer, Vehicle, VerificationDocument,
                     WeeklySlot)

LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati",
             "Punjabi", "Urdu", "Rajasthani", "Konkani", "Odia", "French", "German", "Spanish"]
CATEGORIES = ["food", "heritage", "culture", "nature", "adventure", "photography", "shopping", "spiritual",
              "nightlife", "family", "wildlife", "trekking", "transport"]
TIERS = ("normal", "medium", "lavish")


def _clean_list(values, allowed, label, max_items=8):
    if not isinstance(values, list):
        raise serializers.ValidationError(f"{label} must be a list.")
    cleaned = []
    for v in values:
        v = str(v).strip()
        if allowed is not None and v not in allowed:
            raise serializers.ValidationError(f"Unknown {label.lower()}: {v}.")
        if v and v not in cleaned:
            cleaned.append(v)
    if len(cleaned) > max_items:
        raise serializers.ValidationError(f"Choose up to {max_items}.")
    return cleaned


class ServiceSerializer(serializers.ModelSerializer):
    from_price = serializers.IntegerField(read_only=True)
    managed_by_agency = serializers.SerializerMethodField()

    class Meta:
        model = ServiceOffer
        fields = ["id", "kind", "title", "description", "category", "cover_image", "max_guests", "price",
                  "included_guests", "extra_guest_price", "duration_hours", "start_time", "stops", "duration_days",
                  "normal_price", "medium_price", "lavish_price", "tier_inclusions", "itinerary", "is_active", "from_price",
                  "managed_by_agency"]
        read_only_fields = ["id", "cover_image", "from_price"]

    def get_managed_by_agency(self, obj):
        return getattr(obj, "agency_service_id", None) is not None

    def validate_category(self, value):
        if value not in CATEGORIES:
            raise serializers.ValidationError("Choose a listed category.")
        return value

    def validate_stops(self, value):
        return [str(s).strip()[:80] for s in _clean_list(value, None, "Stops", 12)]

    def validate_itinerary(self, value):
        return [str(s).strip()[:300] for s in _clean_list(value, None, "Itinerary", 30)]

    def validate_tier_inclusions(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected {normal: [...], medium: [...], lavish: [...]}.")
        return {t: [str(i).strip()[:120] for i in value.get(t, [])][:10] for t in TIERS}

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        kind = get("kind") or ServiceOffer.Kind.EXPERIENCE
        if self.instance and "kind" in attrs and attrs["kind"] != self.instance.kind:
            raise serializers.ValidationError({"kind": "Create a new service to change its type."})
        captain = self.context.get("captain") or getattr(self.instance, "captain", None)
        if kind == ServiceOffer.Kind.PACKAGE and captain and captain.captain_type == CaptainProfile.Type.GUIDE:
            raise serializers.ValidationError(
                {"kind": "Guides offer day experiences and guide-by-the-day. Switch to Captain to sell full packages."})
        if kind == ServiceOffer.Kind.EXPERIENCE:
            if not get("price"):
                raise serializers.ValidationError({"price": "Set a price for this experience."})
        elif kind == ServiceOffer.Kind.GUIDE:
            if not get("price"):
                raise serializers.ValidationError({"price": "Set your price per day."})
        else:
            n, m, lv = get("normal_price") or 0, get("medium_price") or 0, get("lavish_price") or 0
            if not n or not m or not lv:
                raise serializers.ValidationError({"normal_price": "Set Normal, Medium and Lavish prices per person."})
            if not n <= m <= lv:
                raise serializers.ValidationError({"medium_price": "Prices must rise from Normal to Medium to Lavish."})
            if (get("duration_days") or 1) < 2:
                raise serializers.ValidationError({"duration_days": "Packages are at least 2 days."})
        return attrs


class VehicleSerializer(serializers.ModelSerializer):
    agency_owned = serializers.SerializerMethodField()

    class Meta:
        model = Vehicle
        fields = ["id", "kind", "make_model", "registration_number", "capacity", "has_ac", "is_active", "agency_owned"]
        read_only_fields = ["id"]

    def get_agency_owned(self, obj):
        return obj.agency_id is not None

    def validate_registration_number(self, value):
        value = "".join(value.upper().split())
        if not 6 <= len(value) <= 12 or not value.isalnum():
            raise serializers.ValidationError("Enter a valid registration number, e.g. TS09AB4821.")
        return value


class DocumentSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.CharField(source="get_doc_type_display", read_only=True)

    class Meta:
        model = VerificationDocument
        fields = ["id", "doc_type", "doc_type_label", "file", "number", "expires_on", "status", "note", "reviewed_at", "created_at"]
        read_only_fields = ["id", "status", "note", "reviewed_at", "created_at"]
        # KYC files are private: never hand out a URL, only admins can download (adminops DocumentFileView).
        extra_kwargs = {"file": {"write_only": True}}


class WeeklySlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklySlot
        fields = ["weekday", "is_available", "start_time", "end_time"]

    def validate(self, attrs):
        if attrs.get("is_available", True) and attrs.get("start_time") and attrs.get("end_time") and attrs["start_time"] >= attrs["end_time"]:
            raise serializers.ValidationError("End time must be after start time.")
        return attrs


class BlockedDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlockedDate
        fields = ["id", "date", "reason"]
        read_only_fields = ["id"]


class PayoutAccountSerializer(serializers.ModelSerializer):
    masked = serializers.CharField(read_only=True)

    class Meta:
        model = PayoutAccount
        fields = ["method", "account_holder", "upi_id", "account_number", "ifsc", "masked", "updated_at"]
        read_only_fields = ["masked", "updated_at"]
        extra_kwargs = {"account_number": {"write_only": True}}

    def validate(self, attrs):
        method = attrs.get("method")
        if method == PayoutAccount.Method.UPI:
            upi = attrs.get("upi_id", "").strip()
            if "@" not in upi or len(upi) < 5:
                raise serializers.ValidationError({"upi_id": "Enter a valid UPI ID, e.g. name@okbank."})
            attrs.update(upi_id=upi, account_number="", ifsc="")
        else:
            acct = "".join(attrs.get("account_number", "").split())
            ifsc = attrs.get("ifsc", "").strip().upper()
            if not acct.isdigit() or not 9 <= len(acct) <= 18:
                raise serializers.ValidationError({"account_number": "Enter a valid account number."})
            if len(ifsc) != 11 or not ifsc[:4].isalpha() or ifsc[4] != "0":
                raise serializers.ValidationError({"ifsc": "Enter a valid 11-character IFSC."})
            attrs.update(account_number=acct, ifsc=ifsc, upi_id="")
        return attrs


class MyProfileSerializer(serializers.ModelSerializer):
    """The Captain editing their own business."""

    full_name = serializers.CharField(source="user.full_name", max_length=150)
    city_id = serializers.PrimaryKeyRelatedField(source="city", queryset=City.objects.filter(is_live=True))
    city_name = serializers.CharField(source="city.name", read_only=True)
    agency = serializers.SerializerMethodField()

    class Meta:
        model = CaptainProfile
        fields = ["id", "code", "full_name", "city_id", "city_name", "agency", "captain_type", "tagline", "bio", "avatar", "years_experience",
                  "languages", "categories", "max_bookings_per_day", "review_status", "review_note", "submitted_at",
                  "is_live", "is_on_hold", "hold_reason", "rating_avg", "rating_count", "trips_completed", "profile_views"]
        read_only_fields = ["id", "code", "avatar", "review_status", "review_note", "submitted_at", "is_live", "is_on_hold",
                            "hold_reason", "rating_avg", "rating_count", "trips_completed", "profile_views"]

    def get_agency(self, obj):
        a = obj.agency
        return {"id": a.id, "code": a.code, "name": a.name, "joined_at": obj.agency_joined_at} if a else None

    def validate_languages(self, value):
        return _clean_list(value, LANGUAGES, "Languages")

    def validate_categories(self, value):
        return _clean_list(value, CATEGORIES, "Categories", 6)

    def validate_captain_type(self, value):
        if (self.instance and value == CaptainProfile.Type.GUIDE
                and self.instance.services.filter(kind=ServiceOffer.Kind.PACKAGE, is_active=True).exists()):
            raise serializers.ValidationError("Pause your full-service packages before switching to Guide.")
        return value

    def validate_city_id(self, city):
        # BR-1: a Captain operates in one city; only Admin can move them once approved.
        if self.instance and self.instance.city_id != city.id and self.instance.review_status != CaptainProfile.ReviewStatus.DRAFT:
            raise serializers.ValidationError("Your city is locked after submission. Contact support to change it.")
        return city

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        if user_data and user_data.get("full_name", "").strip():
            instance.user.full_name = user_data["full_name"].strip()
            instance.user.save(update_fields=["full_name"])
        return super().update(instance, validated_data)


# ---------------------------------------------------------------- public
class CaptainCardSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    city_name = serializers.CharField(source="city.name", read_only=True)
    city_slug = serializers.CharField(source="city.slug", read_only=True)
    agency_name = serializers.CharField(source="agency.name", read_only=True, default=None)
    from_price = serializers.IntegerField(read_only=True, default=None)
    has_package = serializers.BooleanField(read_only=True, default=False)
    has_guide = serializers.BooleanField(read_only=True, default=False)
    captain_type_label = serializers.CharField(source="get_captain_type_display", read_only=True)

    class Meta:
        model = CaptainProfile
        fields = ["id", "code", "name", "avatar", "tagline", "captain_type", "captain_type_label", "city_name", "city_slug",
                  "languages", "categories", "years_experience", "rating_avg", "rating_count", "trips_completed",
                  "is_featured", "is_verified", "agency_name", "from_price", "has_package", "has_guide"]


class PublicServiceSerializer(serializers.ModelSerializer):
    from_price = serializers.IntegerField(read_only=True)

    class Meta:
        model = ServiceOffer
        fields = ["id", "kind", "title", "description", "category", "cover_image", "max_guests", "price",
                  "included_guests", "extra_guest_price", "duration_hours", "start_time", "stops", "duration_days",
                  "normal_price", "medium_price", "lavish_price", "tier_inclusions", "itinerary", "from_price"]


class PublicVehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ["kind", "make_model", "capacity", "has_ac"]


class CaptainDetailSerializer(CaptainCardSerializer):
    services = serializers.SerializerMethodField()
    vehicles = serializers.SerializerMethodField()
    verified = serializers.SerializerMethodField()

    class Meta(CaptainCardSerializer.Meta):
        fields = CaptainCardSerializer.Meta.fields + ["bio", "services", "vehicles", "verified", "created_at"]

    def get_services(self, obj):
        rows = [s for s in obj.services.all() if s.is_active]
        return PublicServiceSerializer(rows, many=True, context=self.context).data

    def get_vehicles(self, obj):
        return PublicVehicleSerializer([v for v in obj.vehicles.all() if v.is_active], many=True).data

    def get_verified(self, obj):
        return obj.review_status == CaptainProfile.ReviewStatus.APPROVED
