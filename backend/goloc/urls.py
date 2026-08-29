from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/cities/", include("apps.cities.urls")),
    path("api/v1/captains/", include("apps.captains.urls")),
    path("api/v1/travelers/", include("apps.travelers.urls")),
    path("api/v1/bookings/", include("apps.bookings.urls")),
    path("api/v1/payments/", include("apps.payments.urls")),
    path("api/v1/content/", include("apps.content.urls")),
    path("api/v1/chat/", include("apps.chat.urls")),
    path("api/v1/safety/", include("apps.safety.urls")),
    path("api/v1/reviews/", include("apps.reviews.urls")),
    path("api/v1/admin-ops/", include("apps.admin_ops.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
]
