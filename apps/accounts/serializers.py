from rest_framework import serializers

from .models import User


class RequestOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=20)


class VerifyOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=10)
    role = serializers.ChoiceField(choices=User.Role.choices)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "phone_number", "phone_verified", "full_name", "role", "created_at"]
        read_only_fields = ["id", "phone_verified", "created_at"]
