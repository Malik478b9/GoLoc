from rest_framework import serializers

from apps.common.api import public_url

from .models import Itinerary

TRAVEL_MODES = ["flight", "train", "bus", "road", "other", ""]
LIST_INPUTS = ("hotels", "must_include", "avoid")
TEXT_INPUTS = ("vehicle", "meals", "notes")


def _leg(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Expected {mode, point, time, reference}.")
    mode = str(value.get("mode", "")).strip().lower()
    if mode not in TRAVEL_MODES:
        raise serializers.ValidationError("Mode is flight, train, bus, road or other.")
    return {"mode": mode, **{k: str(value.get(k, "")).strip()[:120] for k in ("point", "time", "reference")}}


class ItinerarySummarySerializer(serializers.ModelSerializer):
    """Cards: lists, the Captain's public profile, a traveler's booking."""

    tier_label = serializers.CharField(source="get_tier_display", read_only=True)
    share_url = serializers.SerializerMethodField()
    poster_url = serializers.SerializerMethodField()

    class Meta:
        model = Itinerary
        fields = ["id", "code", "kind", "title", "destination", "tier", "tier_label", "days", "guests", "start_date",
                  "end_date", "status", "is_published", "poster", "share_url", "poster_url", "updated_at"]

    def _page(self, obj, suffix=""):
        if obj.status != Itinerary.Status.READY:
            return None
        return public_url(self.context.get("request"), f"/i/{obj.share_token}/{suffix}")

    def get_share_url(self, obj):
        return self._page(obj)

    def get_poster_url(self, obj):
        return self._page(obj, "poster/")


class ItineraryPublicSerializer(ItinerarySummarySerializer):
    captain = serializers.SerializerMethodField()

    class Meta(ItinerarySummarySerializer.Meta):
        fields = ItinerarySummarySerializer.Meta.fields + ["content", "arrival", "departure", "captain"]

    def get_captain(self, obj):
        c = obj.captain
        request = self.context.get("request")
        avatar = (request.build_absolute_uri(c.avatar.url) if request else c.avatar.url) if c.avatar else None
        return {"id": c.id, "code": c.code, "name": c.name, "avatar": avatar, "captain_type": c.captain_type}


class ItinerarySerializer(ItineraryPublicSerializer):
    """The Captain's own view and editor."""

    service_id = serializers.UUIDField(source="service.id", read_only=True, allow_null=True, default=None)
    booking_code = serializers.CharField(source="booking.code", read_only=True, default=None)
    based_on_id = serializers.UUIDField(read_only=True)

    class Meta(ItineraryPublicSerializer.Meta):
        fields = ItineraryPublicSerializer.Meta.fields + [
            "service_id", "booking_code", "based_on_id", "inputs", "requests", "error", "ai_model", "generated_at",
            "edited_by_hand", "created_at",
        ]
        read_only_fields = ["id", "code", "kind", "status", "is_published", "error", "ai_model", "generated_at",
                            "edited_by_hand", "created_at", "updated_at"]

    def validate_arrival(self, value):
        return _leg(value)

    def validate_departure(self, value):
        return _leg(value)

    def validate_inputs(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object.")
        out = {}
        for k in LIST_INPUTS:
            items = value.get(k, [])
            if not isinstance(items, list):
                raise serializers.ValidationError({k: "Expected a list."})
            out[k] = [str(i).strip()[:160] for i in items if str(i).strip()][:30]
        for k in TEXT_INPUTS:
            out[k] = str(value.get(k, "")).strip()[:500]
        return out

    def validate_content(self, value):
        if not isinstance(value, dict) or not isinstance(value.get("days", []), list):
            raise serializers.ValidationError("Expected the itinerary document with a list of days.")
        return value

    def validate_poster(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected the poster object.")
        return value

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end:
            if end < start:
                raise serializers.ValidationError({"end_date": "Departure must be on or after arrival."})
            if "days" not in attrs:
                attrs["days"] = (end - start).days + 1
        return attrs

    def update(self, instance, validated_data):
        if "content" in validated_data or "poster" in validated_data:
            instance.edited_by_hand = True
        return super().update(instance, validated_data)


class CreateItinerarySerializer(ItinerarySerializer):
    """POST: what to plan. Links are checked against the Captain in the view."""

    service_id = serializers.UUIDField(required=False, allow_null=True)
    booking_id = serializers.UUIDField(required=False, allow_null=True)
    based_on_id = serializers.UUIDField(required=False, allow_null=True)
    generate = serializers.BooleanField(required=False, default=True)
    title = serializers.CharField(max_length=140, required=False, allow_blank=True)
    destination = serializers.CharField(max_length=200, required=False, allow_blank=True)

    class Meta(ItinerarySerializer.Meta):
        fields = ItinerarySerializer.Meta.fields + ["booking_id", "generate"]
