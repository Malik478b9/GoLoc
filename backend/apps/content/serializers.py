from rest_framework import serializers

from .models import Post, Reel


class ReelSerializer(serializers.ModelSerializer):
    captain_cap_id = serializers.CharField(source="captain.cap_id", read_only=True)
    captain_business_name = serializers.CharField(source="captain.business_name", read_only=True)

    class Meta:
        model = Reel
        fields = [
            "id", "captain", "captain_cap_id", "captain_business_name", "cloudflare_stream_uid",
            "thumbnail_url", "caption", "status", "views_count", "likes_count",
            "profile_opens_count", "booking_starts_count", "created_at",
        ]
        read_only_fields = [
            "id", "captain", "status", "views_count", "likes_count",
            "profile_opens_count", "booking_starts_count", "created_at",
        ]


class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = ["id", "captain", "image_url", "caption", "created_at"]
        read_only_fields = ["id", "captain", "created_at"]
