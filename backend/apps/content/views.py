from django.db.models import F
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import cloudflare
from .models import Post, Reel
from .serializers import PostSerializer, ReelSerializer


class ReelUploadURLView(APIView):
    """
    POST /api/v1/content/reels/upload-url/
    Step 1 of Captain reel upload: get a direct-upload URL from Cloudflare
    Stream, create a placeholder Reel row, hand the URL to the mobile app.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        upload = cloudflare.create_direct_upload_url()
        reel = Reel.objects.create(
            captain=request.user.captain_profile,
            cloudflare_stream_uid=upload["uid"],
            status=Reel.Status.UPLOADING,
        )
        return Response({"upload_url": upload["uploadURL"], "reel_id": str(reel.id)})


class CloudflareStreamWebhookView(APIView):
    """Cloudflare calls this when a video finishes transcoding."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get("uid")
        status = request.data.get("status", {}).get("state")
        try:
            reel = Reel.objects.get(cloudflare_stream_uid=uid)
        except Reel.DoesNotExist:
            return Response(status=200)

        if status == "ready":
            reel.status = Reel.Status.LIVE
            reel.thumbnail_url = cloudflare.thumbnail_url(uid)
            reel.save(update_fields=["status", "thumbnail_url"])
        return Response(status=200)


class ReelFeedViewSet(viewsets.ReadOnlyModelViewSet):
    """Traveler Discover feed (Section 3.1 · Explore group)."""

    serializer_class = ReelSerializer
    permission_classes = [permissions.AllowAny]
    queryset = Reel.objects.filter(status=Reel.Status.LIVE)

    @action(detail=True, methods=["post"])
    def track_view(self, request, pk=None):
        Reel.objects.filter(pk=pk).update(views_count=F("views_count") + 1)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def track_profile_open(self, request, pk=None):
        Reel.objects.filter(pk=pk).update(profile_opens_count=F("profile_opens_count") + 1)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def track_booking_start(self, request, pk=None):
        Reel.objects.filter(pk=pk).update(booking_starts_count=F("booking_starts_count") + 1)
        return Response(status=204)


class MyPostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Post.objects.filter(captain__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(captain=self.request.user.captain_profile)
