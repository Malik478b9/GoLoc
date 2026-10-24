from django.core.cache import cache
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

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
