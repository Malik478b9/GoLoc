from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCaptain
from apps.bookings.models import Booking
from apps.captains.models import ServiceOffer
from apps.captains.views import _get_captain, my_profile
from apps.common import llm
from apps.common.api import bad_request, role_of
from apps.notifications.service import notify

from . import services
from .ai import GenerationError, rewrite_day
from .models import Itinerary
from .pages import render_document, render_poster
from .serializers import (CreateItinerarySerializer, ItineraryPublicSerializer, ItinerarySerializer,
                          ItinerarySummarySerializer)

TIER_FROM_BOOKING = {"standard": "standard", "normal": "normal", "medium": "medium", "lavish": "lavish"}


def _mine(request):
    return Itinerary.objects.filter(captain__user=request.user).select_related("captain__user", "service", "booking")


def _get_mine(request, pk) -> Itinerary:
    try:
        return _mine(request).get(pk=pk)
    except (Itinerary.DoesNotExist, DjangoValidationError) as exc:
        raise Http404 from exc


class ItineraryListView(generics.ListCreateAPIView):
    """
    GET  /captain/itineraries/?kind=template|custom&booking=BKG-8001
    POST /captain/itineraries/  {title, destination, tier, days, guests, start_date?, end_date?, arrival?, departure?,
                                 inputs?, requests?, service_id?, booking_id?, based_on_id?, generate?}
         booking_id → a custom itinerary prefilled from the booking (dates, guests, tier, the traveler's note) and
         based on the Captain's default itinerary for that service when they have one.
    """

    permission_classes = [IsCaptain]
    serializer_class = ItinerarySummarySerializer
    pagination_class = None

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "itinerary_ai"
        return super().get_throttles()

    def get_queryset(self):
        qs = _mine(self.request)
        p = self.request.query_params
        if p.get("kind") in Itinerary.Kind.values:
            qs = qs.filter(kind=p["kind"])
        if p.get("booking"):
            qs = qs.filter(Q(booking__code=p["booking"].upper()) | Q(booking__id__iexact=p["booking"]))
        return qs

    def create(self, request, *args, **kwargs):
        captain = my_profile(request)
        s = CreateItinerarySerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        d = dict(s.validated_data)
        want_ai = d.pop("generate", True)
        service_id, booking_id, based_on_id = d.pop("service_id", None), d.pop("booking_id", None), d.pop("based_on_id", None)

        if booking_id:
            booking = get_object_or_404(Booking.objects.select_related("service"), pk=booking_id, captain=captain)
            d["booking"] = booking
            d.setdefault("kind", Itinerary.Kind.CUSTOM)
            d["service"] = booking.service
            d.setdefault("start_date", booking.start_date)
            d.setdefault("end_date", booking.end_date)
            d.setdefault("days", (booking.end_date - booking.start_date).days + 1)
            d.setdefault("guests", booking.guests)
            d.setdefault("tier", TIER_FROM_BOOKING.get(booking.tier, "medium"))
            if not d.get("requests"):
                d["requests"] = booking.note
            if not based_on_id:
                default = captain.itineraries.filter(kind=Itinerary.Kind.TEMPLATE, service=booking.service,
                                                     status=Itinerary.Status.READY).order_by("-is_published", "-updated_at").first()
                based_on_id = default.pk if default else None
        if service_id and "service" not in d:
            d["service"] = get_object_or_404(ServiceOffer, pk=service_id, captain=captain)
        if based_on_id:
            d["based_on"] = get_object_or_404(Itinerary, pk=based_on_id, captain=captain)
            base = d["based_on"]
            for field in ("destination", "arrival", "departure", "inputs"):
                if not d.get(field):
                    d[field] = getattr(base, field)
            d.setdefault("service", base.service)
        service = d.get("service")
        if not d.get("title"):
            d["title"] = service.title if service else (d["based_on"].title if d.get("based_on") else "")
        if not d.get("destination"):
            d["destination"] = (service.title if service else "") or captain.city.name
        if not d["title"]:
            raise bad_request("Give this itinerary a title.", "title_required")
        if service and "days" not in d:
            d["days"] = service.duration_days if service.kind == "package" else 1
        if service and service.kind == "package" and "tier" not in d:
            d["tier"] = "medium"
        if d.get("kind") == Itinerary.Kind.CUSTOM and not d.get("booking") and not d.get("start_date"):
            raise bad_request("Custom itineraries need the traveler's arrival date.", "start_date_required")
        for read_only in ("content", "poster"):
            d.pop(read_only, None)

        it = services.create(captain, **d)
        if want_ai:
            it = services.start_generation(it)
        it.refresh_from_db()
        return Response(ItinerarySerializer(it, context={"request": request}).data, status=status.HTTP_201_CREATED)


class ItineraryDetailView(APIView):
    """GET / PATCH (edit anything by hand) / DELETE /captain/itineraries/<id>/"""

    permission_classes = [IsCaptain]

    def get(self, request, pk):
        return Response(ItinerarySerializer(_get_mine(request, pk), context={"request": request}).data)

    def patch(self, request, pk):
        it = _get_mine(request, pk)
        if it.status == Itinerary.Status.GENERATING:
            raise bad_request("Wait for the AI to finish, then edit.", "generating")
        s = ItinerarySerializer(it, data=request.data, partial=True, context={"request": request})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        _get_mine(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GenerateView(APIView):
    """POST /captain/itineraries/<id>/generate/ {instructions?} — write again, or revise with instructions."""

    permission_classes = [IsCaptain]
    throttle_scope = "itinerary_ai"

    def post(self, request, pk):
        it = _get_mine(request, pk)
        instructions = str(request.data.get("instructions", "")).strip()[:2000]
        if instructions and not it.content:
            instructions = ""  # nothing to revise yet: write it fresh
        it = services.start_generation(it, instructions)
        it.refresh_from_db()
        return Response(ItinerarySerializer(it, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)


class RewriteDayView(APIView):
    """
    POST /captain/itineraries/<id>/days/<n>/rewrite/ {instructions, day?}
    → the rewritten day. Not saved: the editor shows it and the Captain saves.
    `day` is the editor's current (possibly unsaved) version of that day.
    """

    permission_classes = [IsCaptain]
    throttle_scope = "ai_assist"

    def post(self, request, pk, day):
        it = _get_mine(request, pk)
        instructions = str(request.data.get("instructions", "")).strip()[:1000]
        if not instructions:
            raise bad_request("Say how to change this day.", "instructions_required")
        if not llm.enabled():
            raise bad_request("AI isn't set up on this server yet.", "ai_disabled")
        current = request.data.get("day")
        if not isinstance(current, dict):
            current = next((d for d in (it.content or {}).get("days", []) if d.get("day") == day), None)
        if current is None:
            raise Http404
        try:
            new = rewrite_day(it, {**current, "day": day}, instructions)
        except GenerationError as exc:
            raise bad_request(str(exc), "ai_failed") from exc
        return Response({**new, "day": day})


class PublishView(APIView):
    """
    POST /captain/itineraries/<id>/publish/ {is_published}
    Default itinerary → shown on the public profile. Custom → shared with the booked traveler.
    """

    permission_classes = [IsCaptain]

    def post(self, request, pk):
        it = _get_mine(request, pk)
        want = bool(request.data.get("is_published", not it.is_published))
        if want and it.status != Itinerary.Status.READY:
            raise bad_request("Finish the itinerary before publishing it.", "not_ready")
        it.is_published = want
        it.save(update_fields=["is_published", "updated_at"])
        if want and it.kind == Itinerary.Kind.CUSTOM and it.booking_id:
            notify(it.booking.traveler, "traveler", "itinerary_shared", f"Your itinerary from {it.captain.name}",
                   f"{it.title} · {it.days} day{'s' if it.days > 1 else ''}. Tap to see the full plan.",
                   {"booking_id": it.booking_id, "itinerary_id": it.id})
        return Response(ItinerarySerializer(it, context={"request": request}).data)


# ---------------------------------------------------------------- travelers
class CaptainItinerariesView(APIView):
    """GET /captains/<id or CAP-code>/itineraries/ — a Captain's published default itineraries."""

    permission_classes = [AllowAny]

    def get(self, request, id_or_code):
        captain = _get_captain(id_or_code)
        rows = captain.itineraries.filter(kind=Itinerary.Kind.TEMPLATE, is_published=True, status=Itinerary.Status.READY)
        return Response(ItinerarySummarySerializer(rows, many=True, context={"request": request}).data)


class PublicItineraryView(APIView):
    """GET /itineraries/<id>/ — a published default itinerary, or a custom one shared with this traveler."""

    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            it = Itinerary.objects.select_related("captain__user", "booking").get(
                pk=pk, is_published=True, status=Itinerary.Status.READY)
        except (Itinerary.DoesNotExist, DjangoValidationError) as exc:
            raise Http404 from exc
        if it.kind == Itinerary.Kind.CUSTOM:
            if not (request.user.is_authenticated and role_of(request) == "traveler" and it.booking
                    and it.booking.traveler_id == request.user.pk):
                raise Http404
        return Response(ItineraryPublicSerializer(it, context={"request": request}).data)


def _page_itinerary(token):
    it = (Itinerary.objects.select_related("captain__user", "captain__city")
          .filter(share_token=token, status=Itinerary.Status.READY).first())
    if not it:
        raise Http404
    return it


def document_page(request, token):
    """/i/<token>/ — the full itinerary as a printable page (Print → Save as PDF)."""
    return HttpResponse(render_document(_page_itinerary(token)))


def poster_page(request, token):
    """/i/<token>/poster/ — the one-glance poster, sized for sharing."""
    return HttpResponse(render_poster(_page_itinerary(token)))

