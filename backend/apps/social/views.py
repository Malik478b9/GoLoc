import os

from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCaptain
from apps.captains.models import ServiceOffer
from apps.captains.views import my_profile
from apps.common.api import NewestFirstCursor, bad_request
from apps.common.files import IMAGE_EXTS, VIDEO_EXTS, validate_image, validate_video

from .models import Post, PostLike
from .serializers import MyPostSerializer, PostSerializer

VISIBLE = dict(status=Post.Status.PUBLISHED, captain__is_live=True, captain__is_on_hold=False)


def _liked_ids(request, posts):
    if not request.user.is_authenticated:
        return set()
    return set(PostLike.objects.filter(user=request.user, post__in=[p.pk for p in posts]).values_list("post_id", flat=True))


class FeedView(generics.ListAPIView):
    """GET /social/feed/?city=<slug>&kind=reel|photo&captain=<id>  — Discover reels feed, cursor-paginated."""

    permission_classes = [AllowAny]
    serializer_class = PostSerializer
    pagination_class = NewestFirstCursor

    def get_queryset(self):
        p = self.request.query_params
        qs = Post.objects.filter(**VISIBLE).select_related("captain__user", "city")
        if p.get("city"):
            qs = qs.filter(city__slug=p["city"])
        if p.get("kind") in {"reel", "photo"}:
            qs = qs.filter(kind=p["kind"])
        if p.get("captain"):
            try:
                qs = qs.filter(captain_id=p["captain"])
            except DjangoValidationError:
                return qs.none()
        return qs

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        ctx = {**self.get_serializer_context(), "liked_ids": _liked_ids(request, page)}
        return self.get_paginated_response(PostSerializer(page, many=True, context=ctx).data)


class LikeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk, status=Post.Status.PUBLISHED)
        try:
            with transaction.atomic():
                PostLike.objects.create(post=post, user=request.user)
                Post.objects.filter(pk=pk).update(like_count=F("like_count") + 1)
        except IntegrityError:
            pass
        return Response({"liked": True, "like_count": Post.objects.values_list("like_count", flat=True).get(pk=pk)})

    def delete(self, request, pk):
        deleted, _ = PostLike.objects.filter(post_id=pk, user=request.user).delete()
        if deleted:
            Post.objects.filter(pk=pk, like_count__gt=0).update(like_count=F("like_count") - 1)
        return Response({"liked": False, "like_count": Post.objects.values_list("like_count", flat=True).filter(pk=pk).first() or 0})


class EventView(APIView):
    """
    POST /social/posts/<id>/event/ {"type": "view" | "profile_open" | "booking_start"}
    Funnel counters for Captain insights. De-duplicated per viewer for 6 hours.
    """

    permission_classes = [AllowAny]
    FIELDS = {"view": "view_count", "profile_open": "profile_opens", "booking_start": "booking_starts"}

    def post(self, request, pk):
        field = self.FIELDS.get(request.data.get("type"))
        if not field:
            raise bad_request("Unknown event type.", "invalid_event")
        viewer = str(request.user.pk) if request.user.is_authenticated else request.META.get("REMOTE_ADDR", "")
        if cache.add(f"pe:{pk}:{field}:{viewer}", 1, 6 * 3600):
            Post.objects.filter(pk=pk).update(**{field: F(field) + 1})
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyPostsView(generics.ListCreateAPIView):
    """Captain: GET own posts; POST multipart {kind, media, thumbnail?, caption?, service_id?}"""

    permission_classes = [IsCaptain]
    serializer_class = MyPostSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "upload"
        return super().get_throttles()

    def get_queryset(self):
        return Post.objects.filter(captain__user=self.request.user).exclude(status=Post.Status.DELETED).select_related("captain__user", "city")

    def create(self, request, *args, **kwargs):
        captain = my_profile(request)
        kind = request.data.get("kind")
        media = request.FILES.get("media")
        thumb = request.FILES.get("thumbnail")
        if kind not in {"reel", "photo"}:
            raise bad_request("Choose reel or photo.", "invalid_kind")
        if not media:
            raise bad_request("Attach a video or photo.", "file_required")
        ext = os.path.splitext(media.name or "")[1].lower()
        try:
            if kind == "reel":
                validate_video(media)
                if thumb:
                    validate_image(thumb)
            else:
                validate_image(media)
        except DjangoValidationError as exc:
            raise bad_request(exc.messages[0], "invalid_file") from exc
        if (kind == "reel" and ext not in VIDEO_EXTS) or (kind == "photo" and ext not in IMAGE_EXTS):
            raise bad_request("File type doesn't match the post type.", "invalid_file")
        caption = str(request.data.get("caption", ""))[:500]
        service = None
        if request.data.get("service_id"):
            service = ServiceOffer.objects.filter(pk=request.data["service_id"], captain=captain).first()
        post = Post(captain=captain, city=captain.city, kind=kind, caption=caption, service=service)
        post.media.save(media.name, media, save=False)
        if thumb:
            post.thumbnail.save(thumb.name, thumb, save=False)
        post.save()
        captain.touch()
        return Response(MyPostSerializer(post, context={"request": request}).data, status=status.HTTP_201_CREATED)


class MyPostDetailView(APIView):
    permission_classes = [IsCaptain]

    def patch(self, request, pk):
        post = get_object_or_404(Post, pk=pk, captain__user=request.user)
        if "caption" in request.data:
            post.caption = str(request.data["caption"])[:500]
            post.save(update_fields=["caption"])
        return Response(MyPostSerializer(post, context={"request": request}).data)

    def delete(self, request, pk):
        Post.objects.filter(pk=pk, captain__user=request.user).update(status=Post.Status.DELETED)
        return Response(status=status.HTTP_204_NO_CONTENT)


class InsightsView(APIView):
    permission_classes = [IsCaptain]

    def get(self, request):
        captain = my_profile(request)
        agg = Post.objects.filter(captain=captain, status=Post.Status.PUBLISHED).aggregate(
            views=Sum("view_count"), likes=Sum("like_count"), opens=Sum("profile_opens"), starts=Sum("booking_starts"))
        return Response({
            "posts": Post.objects.filter(captain=captain, status=Post.Status.PUBLISHED).count(),
            "views": agg["views"] or 0, "likes": agg["likes"] or 0, "profile_opens": agg["opens"] or 0,
            "booking_starts": agg["starts"] or 0, "profile_views": captain.profile_views,
        })
