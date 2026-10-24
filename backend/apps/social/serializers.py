from rest_framework import serializers

from .models import Post


class PostSerializer(serializers.ModelSerializer):
    captain = serializers.SerializerMethodField()
    city_name = serializers.CharField(source="city.name", read_only=True)
    liked = serializers.SerializerMethodField()
    service_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Post
        fields = ["id", "kind", "media", "thumbnail", "caption", "captain", "city_name", "service_id", "like_count",
                  "view_count", "liked", "created_at"]

    def get_captain(self, obj):
        c = obj.captain
        request = self.context.get("request")
        avatar = request.build_absolute_uri(c.avatar.url) if (c.avatar and request) else (c.avatar.url if c.avatar else None)
        return {"id": c.id, "code": c.code, "name": c.name, "avatar": avatar, "rating_avg": c.rating_avg,
                "trips_completed": c.trips_completed}

    def get_liked(self, obj):
        return obj.pk in self.context.get("liked_ids", set())


class MyPostSerializer(PostSerializer):
    class Meta(PostSerializer.Meta):
        fields = PostSerializer.Meta.fields + ["status", "moderation_note", "profile_opens", "booking_starts"]
