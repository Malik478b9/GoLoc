from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Booking
from .serializers import BookingCreateSerializer, BookingSerializer
from .services import cancel_booking, complete_booking


class BookingViewSet(viewsets.ModelViewSet):
    """
    Covers Traveler 'My Bookings', Captain 'Requests'/'Active Trip', and the
    accept / start / complete / cancel lifecycle transitions referenced by
    BR-2, BR-4, and BR-5.
    """

    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head"]

    def get_serializer_class(self):
        return BookingCreateSerializer if self.action == "create" else BookingSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == user.Role.CAPTAIN:
            return Booking.objects.filter(captain__user=user).order_by("-created_at")
        return Booking.objects.filter(traveler=user).order_by("-created_at")

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Captain accepts a REQUESTED booking (Captain 'Requests' screen)."""
        booking = self.get_object()
        if booking.captain.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)
        booking.status = Booking.Status.ACCEPTED
        booking.save(update_fields=["status"])
        return Response(BookingSerializer(booking).data)

    @action(detail=True, methods=["post"])
    def start_trip(self, request, pk=None):
        """Moves a PAID booking to IN_PROGRESS (Live Trip / Active Trip screens)."""
        booking = self.get_object()
        booking.status = Booking.Status.IN_PROGRESS
        booking.save(update_fields=["status"])
        return Response(BookingSerializer(booking).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """BR-2: triggers the payout-eligible ledger flip. Captain-initiated."""
        booking = self.get_object()
        if booking.captain.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)
        complete_booking(booking)
        return Response(BookingSerializer(booking).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """BR-4: time-based refund, with a 100% override if the Captain cancels."""
        booking = self.get_object()
        cancelled_by = "captain" if booking.captain.user_id == request.user.id else "traveler"
        cancel_booking(booking, cancelled_by=cancelled_by)
        return Response(BookingSerializer(booking).data)


class BookingLookupView(viewsets.ReadOnlyModelViewSet):
    """
    Admin-only BKG-ID lookup (BR-7). Wired separately from BookingViewSet so
    permission rules stay simple: this endpoint requires staff status.
    """

    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAdminUser]
    lookup_field = "bkg_id"
    queryset = Booking.objects.all()
