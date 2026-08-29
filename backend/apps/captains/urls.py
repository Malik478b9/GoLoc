from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter

from .views import (
    CaptainDiscoveryViewSet,
    MyAvailabilityViewSet,
    MyCaptainProfileView,
    MyServiceViewSet,
    MyVehicleViewSet,
    ServicePricingTierViewSet,
)

router = DefaultRouter()
router.register("me", MyCaptainProfileView, basename="my-captain-profile")
router.register("me/services", MyServiceViewSet, basename="my-captain-services")
router.register("me/vehicles", MyVehicleViewSet, basename="my-captain-vehicles")
router.register("me/availability", MyAvailabilityViewSet, basename="my-captain-availability")
router.register("discover", CaptainDiscoveryViewSet, basename="captain-discover")

# Nested route: /api/v1/captains/me/services/<service_pk>/pricing-tiers/
services_router = NestedDefaultRouter(router, "me/services", lookup="service")
services_router.register("pricing-tiers", ServicePricingTierViewSet, basename="service-pricing-tiers")

urlpatterns = router.urls + services_router.urls
