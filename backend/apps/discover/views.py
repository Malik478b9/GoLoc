from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .service import feed


class DiscoverView(APIView):
    """GET /discover/?city=hyderabad — seasonal, distance-aware trip posters for the home screen. Public."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(feed(request.query_params.get("city")))
