from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SavedCaptain, TravelerProfile
from .serializers import SavedCaptainSerializer, TravelerProfileSerializer


class MyTravelerProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile, _ = TravelerProfile.objects.get_or_create(user=request.user)
        return Response(TravelerProfileSerializer(profile).data)

    def patch(self, request):
        profile, _ = TravelerProfile.objects.get_or_create(user=request.user)
        serializer = TravelerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SavedCaptainViewSet(viewsets.ModelViewSet):
    serializer_class = SavedCaptainSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SavedCaptain.objects.filter(traveler__user=self.request.user)

    def perform_create(self, serializer):
        profile, _ = TravelerProfile.objects.get_or_create(user=self.request.user)
        serializer.save(traveler=profile)
