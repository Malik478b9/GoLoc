from rest_framework import serializers

from .models import User


class RequestOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=20)
    purpose = serializers.ChoiceField(
        choices=["signup", "login", "sos_contact_change", "payout_account_change"],
        default="login",
    )


class VerifyOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=10)
    # Only required on first-time signup
    role = serializers.ChoiceField(choices=User.Role.choices, required=False)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    primary_city_id = serializers.UUIDField(required=False)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "phone_number", "phone_verified", "full_name", "role",
            "primary_city", "created_at",
        ]
        read_only_fields = ["id", "phone_verified", "created_at"]
