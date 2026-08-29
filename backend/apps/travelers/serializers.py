from rest_framework import serializers

from .models import SavedCaptain, TravelerProfile


class TravelerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = TravelerProfile
        fields = ["id", "emergency_contact_name", "emergency_contact_phone", "created_at"]
        read_only_fields = ["id", "created_at"]


class SavedCaptainSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedCaptain
        fields = ["id", "captain", "created_at"]
        read_only_fields = ["id", "created_at"]
