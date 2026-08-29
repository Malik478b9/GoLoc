from rest_framework import permissions, viewsets

from .models import SOSAlert
from .serializers import SOSAlertSerializer


class SOSAlertViewSet(viewsets.ModelViewSet):
    """
    Admin 'Incidents' queue (Section 2.3 · Trust/Growth) reads/updates here;
    Travelers/Captains only ever see their own alerts.
    """

    serializer_class = SOSAlertSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head"]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return SOSAlert.objects.all()
        return SOSAlert.objects.filter(raised_by=user)
