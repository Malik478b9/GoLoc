from rest_framework import serializers

from .models import AuditLog, Dispute, Incident, Promotion


class IncidentSerializer(serializers.ModelSerializer):
    bkg_id = serializers.CharField(source="booking.bkg_id", read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id", "booking", "bkg_id", "sos_alert", "severity", "status",
            "summary", "assigned_admin", "created_at", "closed_at",
        ]
        read_only_fields = ["id", "bkg_id", "created_at"]


class DisputeSerializer(serializers.ModelSerializer):
    bkg_id = serializers.CharField(source="booking.bkg_id", read_only=True)

    class Meta:
        model = Dispute
        fields = [
            "id", "booking", "bkg_id", "raised_by", "reason", "status",
            "resolution_notes", "created_at", "resolved_at",
        ]
        read_only_fields = ["id", "bkg_id", "raised_by", "created_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ["id", "actor", "action", "target_type", "target_id", "metadata", "created_at"]
        read_only_fields = fields


class PromotionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Promotion
        fields = [
            "id", "captain", "promotion_type", "city", "starts_at", "ends_at",
            "amount_paid", "is_active",
        ]
