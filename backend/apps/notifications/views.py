from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import role_of

from .models import Device, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "data", "read_at", "created_at"]


class DeviceSerializer(serializers.Serializer):
    expo_token = serializers.RegexField(r"^(Expo|Exponent)PushToken\[.+\]$", max_length=200)
    platform = serializers.ChoiceField(choices=["ios", "android", "web"], required=False, default="")


class NotificationListView(generics.ListAPIView):
    """GET /notifications/ — this app's inbox, newest first."""

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user, role=role_of(self.request))

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["unread"] = self.get_queryset().filter(read_at__isnull=True).count()
        return response


class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(user=request.user, role=role_of(request), read_at__isnull=True).count()
        return Response({"unread": count})


class MarkReadView(APIView):
    """POST /notifications/read/  {"ids": [..]} or {} for all."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        qs = Notification.objects.filter(user=request.user, role=role_of(request), read_at__isnull=True)
        ids = request.data.get("ids")
        if isinstance(ids, list) and ids:
            qs = qs.filter(id__in=[i for i in ids if str(i).isdigit()])
        qs.update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceView(APIView):
    """POST registers this phone for push; DELETE (on sign-out) stops it."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = DeviceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        Device.objects.update_or_create(
            expo_token=s.validated_data["expo_token"],
            defaults={"user": request.user, "role": role_of(request) or "", "platform": s.validated_data["platform"],
                      "is_active": True},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request):
        token = str(request.data.get("expo_token", ""))
        Device.objects.filter(user=request.user, expo_token=token).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
