from django.db.models import Avg
from rest_framework import permissions, viewsets

from apps.bookings.models import Booking
from .models import Review
from .serializers import ReviewSerializer


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head"]

    def get_queryset(self):
        return Review.objects.all()

    def perform_create(self, serializer):
        booking = Booking.objects.get(pk=self.request.data["booking"], traveler=self.request.user)
        review = serializer.save(captain=booking.captain, traveler=self.request.user)

        agg = Review.objects.filter(captain=review.captain).aggregate(avg=Avg("rating"))
        review.captain.average_rating = agg["avg"] or 0
        review.captain.save(update_fields=["average_rating"])
