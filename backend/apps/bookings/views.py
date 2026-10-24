from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import IsTravelerOrCaptain, bad_request, require_role, role_of

from . import services
from .models import Booking
from .serializers import BookingCreateSerializer, BookingDetailSerializer, BookingListSerializer

S = Booking.Status

FILTERS = {
    "requests": Q(status=S.REQUESTED),
    "awaiting_payment": Q(status=S.ACCEPTED),
    "upcoming": Q(status__in=[S.REQUESTED, S.ACCEPTED, S.CONFIRMED]),
    "active": Q(status=S.IN_PROGRESS),
    "past": Q(status__in=[S.COMPLETED, S.CANCELLED, S.DECLINED, S.EXPIRED]),
    "completed": Q(status=S.COMPLETED),
}


def scoped_bookings(request):
    role = role_of(request)
    qs = Booking.objects.select_related("captain__user", "traveler", "service", "city")
    if role == "traveler":
        return qs.filter(traveler=request.user)
    if role == "captain":
        return qs.filter(captain__user=request.user)
    raise Http404


def get_booking(request, ref, for_update_detail=False) -> Booking:
    qs = scoped_bookings(request)
    if for_update_detail:
        qs = qs.prefetch_related("events", "refunds").select_related("review")
    ref = str(ref)
    try:
        return qs.get(code=ref.upper()) if ref.upper().startswith("BKG-") else qs.get(pk=ref)
    except (Booking.DoesNotExist, ValueError, DjangoValidationError) as exc:  # malformed UUID → 404 too
        raise Http404 from exc


class BookingListCreateView(generics.ListCreateAPIView):
    """
    GET  /bookings/?filter=upcoming|requests|awaiting_payment|active|past  (traveler or captain view)
    POST /bookings/  (traveler) {service_id, tier, guests, start_date, start_time?, meeting_point?, note?}
    """

    permission_classes = [IsTravelerOrCaptain]
    serializer_class = BookingListSerializer

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "booking_request"
        return super().get_throttles()

    def get_queryset(self):
        qs = scoped_bookings(self.request)
        f = self.request.query_params.get("filter")
        if f in FILTERS:
            qs = qs.filter(FILTERS[f])
        if f in {"upcoming", "requests", "awaiting_payment", "active"}:
            return qs.order_by("start_date", "start_time")
        return qs.order_by("-created_at")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "role": role_of(self.request)}

    def create(self, request, *args, **kwargs):
        require_role(request, "traveler")
        s = BookingCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        booking = services.create_request(
            request.user, d["service"], tier=d["tier"], guests=d["guests"], start_date=d["start_date"],
            start_time=d.get("start_time"), meeting_point=d["meeting_point"], note=d["note"],
        )
        return Response(BookingDetailSerializer(booking, context={"request": request, "role": "traveler"}).data,
                        status=status.HTTP_201_CREATED)


class BookingDetailView(APIView):
    permission_classes = [IsTravelerOrCaptain]

    def get(self, request, ref):
        booking = get_booking(request, ref, for_update_detail=True)
        return Response(BookingDetailSerializer(booking, context={"request": request, "role": role_of(request)}).data)


class BookingActionView(APIView):
    """POST /bookings/<ref>/<action>/  — accept · decline · cancel · start · complete"""

    permission_classes = [IsTravelerOrCaptain]
    CAPTAIN_ONLY = {"accept", "decline", "start", "complete"}

    def post(self, request, ref, action):
        role = role_of(request)
        if action in self.CAPTAIN_ONLY:
            require_role(request, "captain")
        booking = get_booking(request, ref)
        reason = str(request.data.get("reason", "")).strip()
        if action == "accept":
            booking = services.accept(booking, request.user)
        elif action == "decline":
            booking = services.decline(booking, request.user, reason)
        elif action == "cancel":
            if role == "captain" and not reason:
                raise bad_request("Tell the traveler why you're cancelling.", "reason_required")
            booking = services.cancel(booking, request.user, role, reason)
        elif action == "start":
            booking = services.start_trip(booking, request.user, str(request.data.get("pin", "")))
        elif action == "complete":
            booking = services.complete_trip(booking, request.user)
        else:
            raise Http404
        booking = get_booking(request, booking.pk, for_update_detail=True)
        return Response(BookingDetailSerializer(booking, context={"request": request, "role": role}).data)


class CancelPreviewView(APIView):
    """GET /bookings/<ref>/cancel-preview/ → how much comes back if cancelled now."""

    permission_classes = [IsTravelerOrCaptain]

    def get(self, request, ref):
        booking = get_booking(request, ref)
        return Response({**services.cancellation_preview(booking, role_of(request)), "now": timezone.now()})
