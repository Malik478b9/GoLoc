from rest_framework import serializers

from .models import LiveTripPing, SOSAlert


class SOSAlertSerializer(serializers.ModelSerializer):
    bkg_id = serializers.CharField(source="booking.bkg_id", read_only=True)

    class Meta:
        model = SOSAlert
        fields = ["id", "booking", "bkg_id", "latitude", "longitude", "status", "created_at", "admin_notes"]
        read_only_fields = ["id", "booking", "bkg_id", "created_at"]


class LiveTripPingSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveTripPing
        fields = ["latitude", "longitude", "recorded_at"]
