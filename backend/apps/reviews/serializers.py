from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ["id", "booking", "captain", "traveler", "rating", "comment", "created_at"]
        read_only_fields = ["id", "captain", "traveler", "created_at"]
