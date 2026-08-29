from rest_framework.routers import DefaultRouter

from .views import BookingLookupView, BookingViewSet

router = DefaultRouter()
router.register("lookup", BookingLookupView, basename="booking-lookup")
router.register("", BookingViewSet, basename="booking")

urlpatterns = router.urls
