from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, DisputeViewSet, IncidentViewSet, PromotionViewSet

router = DefaultRouter()
router.register("incidents", IncidentViewSet, basename="incident")
router.register("disputes", DisputeViewSet, basename="dispute")
router.register("audit-log", AuditLogViewSet, basename="audit-log")
router.register("promotions", PromotionViewSet, basename="promotion")

urlpatterns = router.urls
