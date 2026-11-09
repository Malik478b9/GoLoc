from django.core.cache import cache
from rest_framework import generics
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import places

from .models import City
from .serializers import CitySerializer


class LiveCityListView(generics.ListAPIView):
    """GET /api/v1/cities/ — every city that's live, for the city picker. Public."""

    permission_classes = [AllowAny]
    serializer_class = CitySerializer
    pagination_class = None  # a short, bounded list

    def get_queryset(self):
        return City.objects.filter(is_live=True)

    def list(self, request, *args, **kwargs):
        # Read on every app launch; Admin edits clear it (adminops CityListView/CityDetailView).
        data = cache.get("cities:live")
        if data is None:
            data = super().list(request, *args, **kwargs).data
            cache.set("cities:live", data, 300)
        return Response(data)


class PlaceSearchView(APIView):
    """GET /api/v1/cities/places/?q=araku — any place in India (state, district, town, village, landmark)."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "places"

    def get(self, request):
        return Response(places.search(request.query_params.get("q", "")))


class PlaceReverseView(APIView):
    """GET /api/v1/cities/places/reverse/?lat=17.4&lng=78.4 — the place at a point ("use my location")."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "places"

    def get(self, request):
        try:
            lat, lng = float(request.query_params["lat"]), float(request.query_params["lng"])
        except (KeyError, ValueError):
            raise ValidationError({"lat": "Send lat and lng."})
        place = places.reverse(lat, lng)
        if not place:
            raise NotFound("We couldn't name that spot. Search for it instead.")
        return Response(place)
