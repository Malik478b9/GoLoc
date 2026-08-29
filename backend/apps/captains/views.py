import uuid

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Availability, CaptainProfile, PricingTier, Service, Vehicle
from .serializers import (
    AvailabilitySerializer,
    CaptainProfileSerializer,
    CaptainPublicProfileSerializer,
    PricingTierSerializer,
    ServiceSerializer,
    VehicleSerializer,
)


class IsOwnerCaptain(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.user_id == request.user.id


def _next_cap_id(city_code: str) -> str:
    seq = CaptainProfile.objects.count() + 1
    return f"CAP-{city_code.upper()[:3]}-{seq:04d}"


class MyCaptainProfileView(viewsets.ViewSet):
    """
    Business setup module (Section 2.2): the logged-in Captain manages
    their own profile, verification submission, and go-live toggle.
    """

    permission_classes = [permissions.IsAuthenticated]

    def retrieve(self, request):
        profile = getattr(request.user, "captain_profile", None)
        if not profile:
            return Response({"detail": "No Captain profile yet."}, status=status.HTTP_404_NOT_FOUND)
        return Response(CaptainProfileSerializer(profile).data)

    def create(self, request):
        """Onboarding: create the Captain profile shell before verification."""
        home_city_id = request.data.get("home_city")
        if CaptainProfile.objects.filter(user=request.user).exists():
            return Response({"detail": "Profile already exists."}, status=status.HTTP_400_BAD_REQUEST)

        from apps.cities.models import City

        city = City.objects.get(pk=home_city_id)
        profile = CaptainProfile.objects.create(
            id=uuid.uuid4(),
            user=request.user,
            home_city=city,
            cap_id=_next_cap_id(city.name),
            business_name=request.data.get("business_name", ""),
            bio=request.data.get("bio", ""),
        )
        request.user.role = request.user.Role.CAPTAIN
        request.user.save(update_fields=["role"])
        return Response(CaptainProfileSerializer(profile).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def submit_verification(self, request):
        """Captain uploads KYC docs (Azure Blob signed URL) for Admin review."""
        profile = request.user.captain_profile
        profile.verification_docs_url = request.data.get("docs_url", "")
        profile.verification_status = CaptainProfile.VerificationStatus.IN_REVIEW
        profile.save(update_fields=["verification_docs_url", "verification_status"])
        return Response(CaptainProfileSerializer(profile).data)

    @action(detail=False, methods=["post"])
    def go_live(self, request):
        """
        Go-live toggle. Requires verification to be complete — enforces
        that unverified Captains can never appear in Traveler search.
        """
        profile = request.user.captain_profile
        if profile.verification_status != CaptainProfile.VerificationStatus.VERIFIED:
            return Response(
                {"detail": "Captain must be verified before going live."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.lifecycle_status = CaptainProfile.LifecycleStatus.LIVE
        profile.last_activity_at = timezone.now()
        profile.save(update_fields=["lifecycle_status", "last_activity_at"])
        return Response(CaptainProfileSerializer(profile).data)


class MyServiceViewSet(viewsets.ModelViewSet):
    """Captain's own Services & Pricing (Section 2.2 · 'Operate' group)."""

    serializer_class = ServiceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Service.objects.filter(captain__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(captain=self.request.user.captain_profile)


class MyVehicleViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Vehicle.objects.filter(captain__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(captain=self.request.user.captain_profile)


class MyAvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Availability.objects.filter(captain__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(captain=self.request.user.captain_profile)
        self.request.user.captain_profile.last_activity_at = timezone.now()
        self.request.user.captain_profile.save(update_fields=["last_activity_at"])


class ServicePricingTierViewSet(viewsets.ModelViewSet):
    """
    Nested under a Service: POST /api/v1/captains/services/<service_id>/pricing-tiers/
    Lets a Captain set Normal/Medium/Lavish pricing (Section 3.3) on their own service.
    """

    serializer_class = PricingTierSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return PricingTier.objects.filter(
            service_id=self.kwargs["service_pk"], service__captain__user=self.request.user
        )

    def perform_create(self, serializer):
        service = Service.objects.get(pk=self.kwargs["service_pk"], captain__user=self.request.user)
        serializer.save(service=service)


class CaptainDiscoveryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Traveler-facing 'Find Captains' (Section 3.1) and public profile view
    (BR-9: Reels -> Profile -> Book funnel). City-scoped per BR-1.
    """

    serializer_class = CaptainPublicProfileSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        qs = CaptainProfile.objects.filter(
            lifecycle_status=CaptainProfile.LifecycleStatus.LIVE,
            verification_status=CaptainProfile.VerificationStatus.VERIFIED,
        )
        city_id = self.request.query_params.get("city")
        if city_id:
            qs = qs.filter(Q(home_city_id=city_id) | Q(expanded_cities__id=city_id))
        search = self.request.query_params.get("q")
        if search:
            qs = qs.filter(
                Q(business_name__icontains=search)
                | Q(specialties__icontains=search)
                | Q(cap_id__iexact=search)
            )
        return qs.distinct()
