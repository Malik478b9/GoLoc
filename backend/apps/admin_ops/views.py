from rest_framework import permissions, viewsets

from .models import AuditLog, Dispute, Incident, Promotion
from .serializers import (
    AuditLogSerializer,
    DisputeSerializer,
    IncidentSerializer,
    PromotionSerializer,
)


class IsAdminOrReadOwnOnly(permissions.BasePermission):
    """Admin console users see everything; Travelers/Captains only their own disputes."""

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff:
            return True
        return obj.raised_by_id == request.user.id


class IncidentViewSet(viewsets.ModelViewSet):
    """Admin Command Center — Incidents queue. Staff-only (Section 2.3)."""

    serializer_class = IncidentSerializer
    permission_classes = [permissions.IsAdminUser]
    queryset = Incident.objects.all()


class DisputeViewSet(viewsets.ModelViewSet):
    serializer_class = DisputeSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOwnOnly]

    def get_queryset(self):
        user = self.request.user
        return Dispute.objects.all() if user.is_staff else Dispute.objects.filter(raised_by=user)

    def perform_create(self, serializer):
        serializer.save(raised_by=self.request.user)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAdminUser]
    queryset = AuditLog.objects.all()


class PromotionViewSet(viewsets.ModelViewSet):
    """Admin manages sponsored/featured placement; Captains can view their own."""

    serializer_class = PromotionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return Promotion.objects.all()
        return Promotion.objects.filter(captain__user=user)
