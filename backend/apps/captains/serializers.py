from rest_framework import serializers

from .models import Availability, CaptainProfile, PackageLineItem, PricingTier, Service, Vehicle


class PackageLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PackageLineItem
        fields = ["id", "category", "description", "estimated_cost"]


class PricingTierSerializer(serializers.ModelSerializer):
    line_items = PackageLineItemSerializer(many=True, read_only=True)

    class Meta:
        model = PricingTier
        fields = ["id", "tier", "price_per_person", "line_items"]


class ServiceSerializer(serializers.ModelSerializer):
    pricing_tiers = PricingTierSerializer(many=True, read_only=True)

    class Meta:
        model = Service
        fields = [
            "id", "service_type", "title", "description", "duration_days",
            "is_active", "pricing_tiers", "created_at",
        ]


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ["id", "vehicle_type", "registration_number", "seating_capacity"]


class AvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Availability
        fields = ["id", "date", "is_available", "note"]


class CaptainPublicProfileSerializer(serializers.ModelSerializer):
    """
    What a Traveler sees when they open a Captain's public profile
    (Section 3.2, step 2 of the Reels -> book funnel).
    """

    services = ServiceSerializer(many=True, read_only=True)
    home_city = serializers.StringRelatedField()

    class Meta:
        model = CaptainProfile
        fields = [
            "id", "cap_id", "business_name", "bio", "specialties", "languages",
            "home_city", "average_rating", "total_trips", "services",
        ]


class CaptainProfileSerializer(serializers.ModelSerializer):
    """Full profile, used by the Captain themselves to view/edit their own business."""

    vehicles = VehicleSerializer(many=True, read_only=True)
    services = ServiceSerializer(many=True, read_only=True)

    class Meta:
        model = CaptainProfile
        fields = [
            "id", "cap_id", "home_city", "expanded_cities", "business_name", "bio",
            "specialties", "languages", "verification_status", "verification_docs_url",
            "lifecycle_status", "average_rating", "total_trips", "vehicles", "services",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "cap_id", "verification_status", "lifecycle_status",
            "average_rating", "total_trips",
        ]
