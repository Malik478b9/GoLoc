from datetime import timedelta

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCaptain, IsTraveler
from apps.bookings.models import Booking
from apps.captains.services import refresh_rating
from apps.common.api import bad_request, conflict
from apps.notifications.service import notify

from .models import Review

REVIEW_WINDOW_DAYS = 30


class PublicReviewSerializer(serializers.ModelSerializer):
    traveler_name = serializers.SerializerMethodField()
    trip_title = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ["id", "rating", "comment", "captain_reply", "traveler_name", "trip_title", "created_at"]

    def get_traveler_name(self, obj):
        name = (obj.traveler.full_name or "Traveler").split()
        return f"{name[0]} {name[1][0]}." if len(name) > 1 else name[0]

    def get_trip_title(self, obj):
        return obj.booking.service_snapshot.get("title") if hasattr(obj, "booking") else None


class CreateReviewSerializer(serializers.Serializer):
    booking_id = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class CreateReviewView(APIView):
    permission_classes = [IsTraveler]

    def post(self, request):
        s = CreateReviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        booking = get_object_or_404(Booking.objects.select_related("captain__user"), pk=d["booking_id"], traveler=request.user)
        if booking.status != Booking.Status.COMPLETED:
            raise conflict("You can review a trip after it's completed.", "not_completed")
        if booking.completed_at and timezone.now() - booking.completed_at > timedelta(days=REVIEW_WINDOW_DAYS):
            raise conflict(f"Reviews close {REVIEW_WINDOW_DAYS} days after the trip.", "review_window_closed")
        try:
            with transaction.atomic():
                review = Review.objects.create(booking=booking, captain=booking.captain, traveler=request.user,
                                               rating=d["rating"], comment=d["comment"].strip())
        except IntegrityError:
            raise conflict("You've already reviewed this trip.", "already_reviewed")
        refresh_rating(booking.captain_id)
        notify(booking.captain.user, "captain", "new_review", f"New {d['rating']}★ review", d["comment"][:140] or booking.code,
               {"review_id": review.id})
        return Response(PublicReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class CaptainReviewsView(generics.ListAPIView):
    """GET /reviews/captains/<captain_id>/ — public."""

    permission_classes = [AllowAny]
    serializer_class = PublicReviewSerializer

    def get_queryset(self):
        return Review.objects.filter(captain_id=self.kwargs["captain_id"], is_hidden=False).select_related("traveler", "booking")


class MyReceivedReviewsView(generics.ListAPIView):
    permission_classes = [IsCaptain]
    serializer_class = PublicReviewSerializer

    def get_queryset(self):
        return Review.objects.filter(captain__user=self.request.user).select_related("traveler", "booking")


class ReplyView(APIView):
    permission_classes = [IsCaptain]

    def post(self, request, pk):
        review = get_object_or_404(Review, pk=pk, captain__user=request.user)
        reply = str(request.data.get("reply", "")).strip()[:1000]
        if not reply:
            raise bad_request("Write a reply.", "empty")
        review.captain_reply = reply
        review.replied_at = timezone.now()
        review.save(update_fields=["captain_reply", "replied_at"])
        return Response(PublicReviewSerializer(review).data)
