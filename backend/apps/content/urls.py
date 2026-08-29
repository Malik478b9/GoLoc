from rest_framework.routers import DefaultRouter

from .views import (
    CloudflareStreamWebhookView,
    MyPostViewSet,
    ReelFeedViewSet,
    ReelUploadURLView,
)
from django.urls import path

router = DefaultRouter()
router.register("reels", ReelFeedViewSet, basename="reel-feed")
router.register("posts/me", MyPostViewSet, basename="my-posts")

urlpatterns = [
    path("reels/upload-url/", ReelUploadURLView.as_view(), name="reel-upload-url"),
    path("webhooks/cloudflare-stream/", CloudflareStreamWebhookView.as_view(), name="cf-stream-webhook"),
] + router.urls
