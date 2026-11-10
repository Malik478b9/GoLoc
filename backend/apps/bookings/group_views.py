"""
Group departures over HTTP.

  Travelers   GET  /groups/?city=&captain=      open departures with seats left
              GET  /groups/<id|GRP-code>/       one departure
              POST /groups/<id|GRP-code>/join/  {guests, guest_details?, note?} → the new booking (pay next)
  Captains    GET/POST /captain/groups/         my departures · post a new one
              GET  /captain/groups/<id>/        with who joined
              POST /captain/groups/<id>/cancel/ {reason} → everyone refunded in full
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCaptain, IsTraveler
from apps.captains.models import ServiceOffer
from apps.common.api import bad_request, role_of

from . import groups
from .models import Booking, GroupTrip
from .serializers import BookingDetailSerializer


def _abs(request, field):
    if not field:
        return None
    return request.build_absolute_uri(field.url) if request else field.url


def annotated(qs):
    return qs.select_related("captain__user", "captain__city", "service", "city").annotate(
        taken=Coalesce(Sum("bookings__guests", filter=Q(bookings__status__in=GroupTrip.SEAT_STATUSES)), 0),
        paid=Coalesce(Sum("bookings__guests", filter=Q(bookings__status__in=GroupTrip.PAID_STATUSES)), 0),
    )


class GroupSerializer(serializers.ModelSerializer):
    captain = serializers.SerializerMethodField()
    service = serializers.SerializerMethodField()
    city_name = serializers.CharField(source="city.name", read_only=True)
    seats_taken = serializers.SerializerMethodField()
    seats_paid = serializers.SerializerMethodField()
    seats_left = serializers.SerializerMethodField()
    will_run = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    days = serializers.SerializerMethodField()
    insurance_per_seat = serializers.SerializerMethodField()
    decide_at = serializers.SerializerMethodField()
    my_booking = serializers.SerializerMethodField()

    class Meta:
        model = GroupTrip
        fields = ["id", "code", "title", "captain", "service", "city_name", "start_date", "end_date", "start_time", "days",
                  "meeting_point", "note", "seats", "min_seats", "seats_taken", "seats_paid", "seats_left", "will_run",
                  "price_per_seat", "insurance_per_seat", "status", "state", "cancel_reason", "decide_at", "my_booking",
                  "created_at"]

    def _taken(self, obj):
        return obj.taken if hasattr(obj, "taken") else obj.seats_taken()

    def _paid(self, obj):
        return obj.paid if hasattr(obj, "paid") else obj.seats_paid()

    def get_captain(self, obj):
        c = obj.captain
        return {"id": c.id, "code": c.code, "name": c.name, "avatar": _abs(self.context.get("request"), c.avatar),
                "rating_avg": c.rating_avg, "rating_count": c.rating_count, "is_verified": c.is_verified,
                "trips_completed": c.trips_completed, "languages": c.languages}

    def get_service(self, obj):
        s = obj.service
        return {"id": s.id, "kind": s.kind, "category": s.category, "description": s.description,
                "cover_image": _abs(self.context.get("request"), s.cover_image), "duration_hours": s.duration_hours,
                "duration_days": s.duration_days, "stops": s.stops, "itinerary": s.itinerary}

    def get_seats_taken(self, obj):
        return self._taken(obj)

    def get_seats_paid(self, obj):
        return self._paid(obj)

    def get_seats_left(self, obj):
        return max(0, obj.seats - self._taken(obj))

    def get_will_run(self, obj):
        return self._paid(obj) >= obj.min_seats

    def get_days(self, obj):
        return (obj.end_date - obj.start_date).days + 1

    def get_insurance_per_seat(self, obj):
        return settings.INSURANCE_FEE_PER_GUEST_DAY * self.get_days(obj)

    def get_decide_at(self, obj):
        return groups.decide_at(obj)

    def get_state(self, obj):
        """open · full · departed · finished · cancelled — what the screens show."""
        if obj.status == GroupTrip.Status.CANCELLED:
            return "cancelled"
        today = timezone.localdate()
        if today > obj.end_date:
            return "finished"
        if timezone.now() >= obj.starts_at:
            return "departed"
        return "full" if self._taken(obj) >= obj.seats else "open"

    def get_my_booking(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or role_of(request) != "traveler":
            return None
        b = obj.bookings.filter(traveler=request.user).exclude(status__in=[Booking.Status.EXPIRED]).order_by("-created_at").first()
        return {"id": b.id, "code": b.code, "status": b.status, "guests": b.guests} if b else None


class GroupCreateSerializer(serializers.Serializer):
    service_id = serializers.UUIDField()
    title = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    start_date = serializers.DateField()
    start_time = serializers.TimeField(required=False, allow_null=True)
    seats = serializers.IntegerField(min_value=2, max_value=30)
    min_seats = serializers.IntegerField(min_value=1, max_value=30)
    price_per_seat = serializers.IntegerField(min_value=1, max_value=500000)
    meeting_point = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class JoinSerializer(serializers.Serializer):
    guests = serializers.IntegerField(min_value=1, max_value=20)
    guest_details = serializers.ListField(child=serializers.DictField(), required=False, allow_null=True, max_length=20)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


def _get(qs, ref) -> GroupTrip:
    ref = str(ref)
    try:
        return qs.get(code=ref.upper()) if ref.upper().startswith("GRP-") else qs.get(pk=ref)
    except (GroupTrip.DoesNotExist, ValueError, DjangoValidationError) as exc:
        raise Http404 from exc


def _upcoming(qs):
    return qs.filter(status=GroupTrip.Status.OPEN, start_date__gte=timezone.localdate())


# ---------------------------------------------------------------- travelers
class GroupListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _upcoming(GroupTrip.objects.filter(captain__is_live=True, captain__is_on_hold=False))
        city = request.query_params.get("city")
        if city:
            qs = qs.filter(Q(city__slug=city) | Q(city_id=city)) if str(city).isdigit() else qs.filter(city__slug=city)
        captain = request.query_params.get("captain")
        if captain:
            try:
                qs = qs.filter(captain_id=uuid.UUID(str(captain)))
            except ValueError:
                qs = qs.none()
        rows = [g for g in annotated(qs)[:60] if g.starts_at > timezone.now()]
        if request.query_params.get("all") != "1":
            rows = [g for g in rows if g.taken < g.seats]
        return Response(GroupSerializer(rows, many=True, context={"request": request}).data)


class GroupDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, ref):
        group = _get(annotated(GroupTrip.objects.all()), ref)
        return Response(GroupSerializer(group, context={"request": request}).data)


class GroupJoinView(APIView):
    permission_classes = [IsTraveler]
    throttle_scope = "booking_request"

    def post(self, request, ref):
        group = _get(GroupTrip.objects.select_related("captain__user", "service", "city"), ref)
        s = JoinSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        booking = groups.join(request.user, group, guests=d["guests"], guest_details=d.get("guest_details"), note=d["note"])
        booking = Booking.objects.select_related("captain__user", "traveler", "service", "city").prefetch_related(
            "events", "refunds").get(pk=booking.pk)
        return Response(BookingDetailSerializer(booking, context={"request": request, "role": "traveler"}).data,
                        status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------- captains
def _mine(request):
    from apps.captains.views import my_profile

    return my_profile(request)


class CaptainGroupListView(APIView):
    permission_classes = [IsCaptain]

    def get(self, request):
        captain = _mine(request)
        qs = annotated(captain.group_trips.all())
        upcoming = [g for g in qs.filter(end_date__gte=timezone.localdate()).order_by("start_date", "start_time")]
        past = list(qs.filter(end_date__lt=timezone.localdate()).order_by("-start_date")[:20])
        ctx = {"request": request}
        services = captain.services.filter(is_active=True).exclude(kind="guide")
        return Response({
            "upcoming": GroupSerializer(upcoming, many=True, context=ctx).data,
            "past": GroupSerializer(past, many=True, context=ctx).data,
            "services": [{"id": s.id, "title": s.title, "kind": s.kind, "max_guests": s.max_guests,
                          "duration_days": s.duration_days if s.kind == "package" else 1,
                          "start_time": s.start_time, "suggested_price": groups.suggested_price(s)} for s in services],
            "decide_hours": settings.GROUP_DECIDE_HOURS,
            "earliest_date": timezone.localdate() + timedelta(days=1),
        })

    def post(self, request):
        captain = _mine(request)
        if captain.agency_id:
            raise bad_request("Your agency plans group trips for you.", "agency_managed")
        s = GroupCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        service = ServiceOffer.objects.filter(pk=d["service_id"], captain=captain).first()
        if service is None:
            raise bad_request("Choose one of your own trips.", "not_your_service")
        group = groups.create_group(
            captain, service, start_date=d["start_date"], seats=d["seats"], min_seats=d["min_seats"],
            price_per_seat=d["price_per_seat"], start_time=d.get("start_time"), meeting_point=d["meeting_point"],
            note=d["note"], title=d["title"],
        )
        group = annotated(GroupTrip.objects.filter(pk=group.pk)).get()
        return Response(GroupSerializer(group, context={"request": request}).data, status=status.HTTP_201_CREATED)


def _travelers(group):
    """Who's coming, for the Captain: names only (privacy), their booking to check in with the PIN."""
    rows = []
    for b in group.bookings.exclude(status__in=[Booking.Status.EXPIRED]).select_related("traveler").order_by("created_at"):
        rows.append({
            "booking_id": b.id, "code": b.code, "status": b.status, "status_label": b.get_status_display(),
            "name": b.traveler.full_name or "Traveler", "guests": b.guests,
            "guest_names": [g.get("name", "") for g in (b.guest_details or [])],
            "fare": b.fare, "captain_net": b.captain_net,
            "can_start": b.status == Booking.Status.CONFIRMED and timezone.localdate() >= b.start_date,
            "can_complete": b.status == Booking.Status.IN_PROGRESS and timezone.localdate() >= b.end_date,
        })
    return rows


class CaptainGroupDetailView(APIView):
    permission_classes = [IsCaptain]

    def get(self, request, pk):
        captain = _mine(request)
        group = _get(annotated(captain.group_trips.all()), pk)
        data = GroupSerializer(group, context={"request": request}).data
        data["travelers"] = _travelers(group)
        data["earnings"] = sum(r["captain_net"] for r in data["travelers"] if r["status"] in Booking.PAID)
        return Response(data)


class CaptainGroupCancelView(APIView):
    permission_classes = [IsCaptain]

    def post(self, request, pk):
        captain = _mine(request)
        group = _get(captain.group_trips.all(), pk)
        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            raise bad_request("Tell the travelers why you're cancelling.", "reason_required")
        groups.cancel_group(group, request.user, "captain", reason)
        group = _get(annotated(captain.group_trips.all()), pk)
        data = GroupSerializer(group, context={"request": request}).data
        data["travelers"] = _travelers(group)
        return Response(data)
