from django.conf import settings
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from django.views.static import serve

from apps.captains.urls import captain_urlpatterns, public_urlpatterns
from apps.itineraries.views import PublicItineraryView, document_page, poster_page
from apps.payments.urls import page_urlpatterns as pay_pages
from apps.trips.views import share_page


def health(request):
    """Load balancer / uptime check. 200 when the app can reach its database."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return JsonResponse({"status": "ok"})
    except Exception:  # noqa: BLE001 — any DB failure means "not healthy"
        return JsonResponse({"status": "database_unavailable"}, status=503)


admin.site.site_header = "GoLoc administration"
admin.site.site_title = "GoLoc admin"

api = [
    path("health/", health, name="health"),
    path("auth/", include("apps.accounts.urls")),
    path("cities/", include("apps.cities.urls")),
    path("captain/", include(captain_urlpatterns)),
    path("captains/", include(public_urlpatterns)),
    path("bookings/", include("apps.bookings.urls")),
    path("payments/", include("apps.payments.urls")),
    path("trips/", include("apps.trips.urls")),
    path("social/", include("apps.social.urls")),
    path("chat/", include("apps.chat.urls")),
    path("reviews/", include("apps.reviews.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("support/", include("apps.support.urls")),
    path("admin/", include("apps.adminops.urls")),
    path("itineraries/<uuid:pk>/", PublicItineraryView.as_view(), name="itinerary-public"),
    path("ai/", include("apps.assist.urls")),
    path("discover/", include("apps.discover.urls")),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/v1/", include(api)),
    path("pay/", include(pay_pages)),
    path("t/<str:token>/", share_page, name="trip-share-page"),
    path("i/<str:token>/", document_page, name="itinerary-page"),
    path("i/<str:token>/poster/", poster_page, name="itinerary-poster-page"),
]

if settings.DEBUG or settings.STORAGES["default"]["BACKEND"].endswith("FileSystemStorage"):
    # Local disk media. In production put nginx (or S3/R2) in front of this.
    urlpatterns += [path(f"{settings.MEDIA_URL.strip('/')}/<path:path>", serve, {"document_root": settings.MEDIA_ROOT})]
