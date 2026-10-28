from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsTraveler
from apps.common.api import bad_request, role_of

from .catalog import SPOTS
from .models import SavedTrip
from .service import feed, saved_posters

SPOT_KEYS = {s["key"] for s in SPOTS}


def _saved_keys(request) -> list[str]:
    if not request.user.is_authenticated or role_of(request) != "traveler":
        return []
    return list(SavedTrip.objects.filter(traveler=request.user).values_list("spot_key", flat=True))


class DiscoverView(APIView):
    """GET /discover/?city=hyderabad — the home screen's 7 seasonal, distance-aware trip posters. Public."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(feed(request.query_params.get("city"), saved=set(_saved_keys(request))))


class SavedTripsView(APIView):
    """GET /discover/saved/?city=… — the traveler's saved trip posters, newest first."""

    permission_classes = [IsTraveler]

    def get(self, request):
        return Response(saved_posters(request.query_params.get("city"), _saved_keys(request)))


class SaveTripView(APIView):
    """POST / DELETE /discover/saved/<key>/ — save a trip poster for later, or remove it."""

    permission_classes = [IsTraveler]

    def post(self, request, key):
        if key not in SPOT_KEYS:
            raise bad_request("That trip isn't available.", "unknown_trip")
        SavedTrip.objects.get_or_create(traveler=request.user, spot_key=key)
        return Response({"saved": True})

    def delete(self, request, key):
        SavedTrip.objects.filter(traveler=request.user, spot_key=key).delete()
        return Response({"saved": False})
