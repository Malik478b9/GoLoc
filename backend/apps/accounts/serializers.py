from rest_framework import serializers

from apps.cities.models import City
from apps.cities.serializers import CitySerializer

from .models import TravelerProfile, User
from .phone import InvalidPhoneNumber, normalize_phone
from .tokens import session_role


class PhoneNumberField(serializers.CharField):
    """Accepts what people type; hands the view an E.164 number."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 24)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return normalize_phone(value)
        except InvalidPhoneNumber as exc:
            raise serializers.ValidationError(str(exc)) from exc


class RequestOTPSerializer(serializers.Serializer):
    phone_number = PhoneNumberField()
    # Optional: which app is asking. Lets us skip sending an SMS when someone
    # tries the admin console with a number that isn't an admin.
    role = serializers.ChoiceField(choices=User.Role.choices, required=False)
    # "signin": the number must already have an account (we say so before sending a code).
    # "signup": new or existing number; the name is asked up front. Omitted: either (older app builds).
    intent = serializers.ChoiceField(choices=["signin", "signup"], required=False)


class VerifyOTPSerializer(serializers.Serializer):
    phone_number = PhoneNumberField()
    code = serializers.CharField(max_length=10, trim_whitespace=True)
    role = serializers.ChoiceField(choices=User.Role.choices)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True, trim_whitespace=True)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class UserSerializer(serializers.ModelSerializer):
    city = CitySerializer(read_only=True)
    city_id = serializers.PrimaryKeyRelatedField(
        source="city", queryset=City.objects.filter(is_live=True), write_only=True, required=False, allow_null=True,
        error_messages={"does_not_exist": "That city isn't available."},
    )
    role = serializers.SerializerMethodField(help_text="The app this session is signed in to.")
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "phone_number", "phone_verified", "full_name", "email", "role", "is_admin",
                  "city", "city_id", "created_at"]
        read_only_fields = ["id", "phone_number", "phone_verified", "created_at"]
        extra_kwargs = {"full_name": {"trim_whitespace": True}, "email": {"required": False}}

    def get_role(self, obj):
        request = self.context.get("request")
        return (session_role(request) if request else None) or self.context.get("role") or obj.role

    def get_is_admin(self, obj):
        return bool(obj.is_staff)


class TravelerProfileSerializer(serializers.ModelSerializer):
    emergency_contact_phone = PhoneNumberField(required=False, allow_blank=True)

    class Meta:
        model = TravelerProfile
        fields = ["emergency_contact_name", "emergency_contact_phone", "languages", "interests"]

    def validate_emergency_contact_phone(self, value):
        user = self.instance.user if self.instance else None
        if value and user and value == user.phone_number:
            raise serializers.ValidationError("Use someone else's number for your emergency contact.")
        return value

    def validate_languages(self, value):
        return [str(v)[:30] for v in value][:8] if isinstance(value, list) else []

    def validate_interests(self, value):
        return [str(v)[:30] for v in value][:10] if isinstance(value, list) else []
