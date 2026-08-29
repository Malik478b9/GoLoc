from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from .models import City
from .serializers import CitySerializer


class CityViewSet(viewsets.ReadOnlyModelViewSet):
    """Public read-only list of live cities, used by app onboarding/city pickers."""

    queryset = City.objects.filter(is_live=True)
    serializer_class = CitySerializer
    permission_classes = [AllowAny]
