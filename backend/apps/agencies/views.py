from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAgency, IsCaptain
from apps.bookings import services as booking_services
from apps.bookings.models import Booking
from apps.bookings.serializers import BookingDetailSerializer, BookingListSerializer
from apps.captains.models import CaptainProfile, Vehicle
from apps.captains.serializers import CATEGORIES
from apps.captains.signals import bump_discovery
from apps.common.api import bad_request, conflict
from apps.payments import services as payments
from apps.payments.models import LedgerEntry, Payout
from apps.payments.views import LedgerSerializer, PayoutSerializer

from . import services
from .models import Agency, AgencyDocument, AgencyInvite, AgencyPayoutAccount, AgencyService
from .serializers import (AgencyCaptainSerializer, AgencyDocumentSerializer, AgencyPayoutAccountSerializer, AgencySerializer,
                          AgencyServiceSerializer, AgencyVehicleSerializer, InviteSerializer)


def my_agency(request) -> Agency:
    agency = Agency.objects.select_related("owner", "city").filter(owner=request.user).first()
    if agency is None:
        raise conflict("Register your agency first.", "no_agency")
    return agency


def _ctx(view, **extra):
    return {"request": view.request, "role": "agency", **extra}


# ================================================================ the agency's own business
class OptionsView(APIView):
    permission_classes = [IsAgency]

    def get(self, request):
        return Response({
            "document_types": [{"value": v, "label": l, "required": v in AgencyDocument.REQUIRED}
                               for v, l in AgencyDocument.DocType.choices],
            "categories": CATEGORIES,
            "vehicle_kinds": [{"value": v, "label": l} for v, l in Vehicle.Kind.choices],
        })


class ProfileView(APIView):
    """GET → agency or null. PUT registers on first call, updates after."""

    permission_classes = [IsAgency]

    def get(self, request):
        agency = Agency.objects.select_related("owner", "city").filter(owner=request.user).first()
        if agency is None:
            return Response(None)
        return Response({**AgencySerializer(agency, context={"request": request}).data, "checklist": services.checklist(agency)})

    def put(self, request):
        agency = Agency.objects.filter(owner=request.user).first()
        s = AgencySerializer(agency, data=request.data, partial=agency is not None, context={"request": request})
        s.is_valid(raise_exception=True)
        agency = s.save() if agency else services.create_agency(request.user, **s.validated_data)
        return Response({**AgencySerializer(agency, context={"request": request}).data, "checklist": services.checklist(agency)})


class LogoView(APIView):
    permission_classes = [IsAgency]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    def post(self, request):
        agency = my_agency(request)
        file = request.FILES.get("logo")
        if not file:
            raise bad_request("Attach your logo.", "file_required")
        agency.logo.save(file.name, file, save=True)
        return Response(AgencySerializer(agency, context={"request": request}).data)


class DocumentListView(generics.ListCreateAPIView):
    permission_classes = [IsAgency]
    serializer_class = AgencyDocumentSerializer
    parser_classes = [MultiPartParser, FormParser]
    pagination_class = None
    throttle_scope = "upload"

    def get_queryset(self):
        return AgencyDocument.objects.filter(agency__owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(agency=my_agency(self.request))


class PayoutAccountView(APIView):
    permission_classes = [IsAgency]

    def get(self, request):
        account = AgencyPayoutAccount.objects.filter(agency__owner=request.user).first()
        return Response(AgencyPayoutAccountSerializer(account).data if account else None)

    def put(self, request):
        agency = my_agency(request)
        s = AgencyPayoutAccountSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        account, _ = AgencyPayoutAccount.objects.update_or_create(agency=agency, defaults=s.validated_data)
        return Response(AgencyPayoutAccountSerializer(account).data)


class SubmitView(APIView):
    permission_classes = [IsAgency]

    def post(self, request):
        agency = services.submit(my_agency(request))
        return Response({**AgencySerializer(agency, context={"request": request}).data, "checklist": services.checklist(agency)})


class DashboardView(APIView):
    permission_classes = [IsAgency]

    def get(self, request):
        agency = my_agency(request)
        today = timezone.localdate()
        captains = CaptainProfile.objects.filter(agency=agency)
        bookings = Booking.objects.filter(agency=agency)
        upcoming = bookings.filter(status__in=[Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS], end_date__gte=today)
        requests = bookings.filter(status=Booking.Status.REQUESTED)
        rel = ("captain__user", "traveler", "service", "city")
        return Response({
            "agency": AgencySerializer(agency, context={"request": request}).data,
            "checklist": services.checklist(agency),
            "captains": {"total": captains.count(), "live": captains.filter(is_live=True).count(),
                         "pending_kyc": captains.exclude(review_status=CaptainProfile.ReviewStatus.APPROVED).count()},
            "invites_pending": agency.invites.filter(status=AgencyInvite.Status.PENDING).count(),
            "trips_listed": agency.services.filter(is_active=True).count(),
            "requests": BookingListSerializer(requests.select_related(*rel).order_by("request_expires_at")[:8], many=True,
                                              context=_ctx(self)).data,
            "requests_count": requests.count(),
            "upcoming": BookingListSerializer(upcoming.select_related(*rel).order_by("start_date")[:8], many=True,
                                              context=_ctx(self)).data,
            "upcoming_count": upcoming.count(),
            "wallet": payments.wallet(agency=agency),
        })


# ---------------------------------------------------------------- Captains
class CaptainListView(generics.ListAPIView):
    permission_classes = [IsAgency]
    serializer_class = AgencyCaptainSerializer
    pagination_class = None

    def get_queryset(self):
        agency = my_agency(self.request)
        month_start = timezone.localdate().replace(day=1)
        earned = (LedgerEntry.objects.filter(agency=agency, captain=OuterRef("pk"), kind=LedgerEntry.Kind.TRIP_EARNING,
                                             created_at__date__gte=month_start)
                  .values("captain").annotate(s=Sum("amount")).values("s"))
        return (CaptainProfile.objects.filter(agency=agency).select_related("user", "city").prefetch_related("vehicles")
                .annotate(month_earned=Coalesce(Subquery(earned, output_field=IntegerField()), 0),
                          upcoming=Count("bookings", filter=Q(bookings__status__in=Booking.ACTIVE, bookings__agency=agency)))
                .order_by("-is_live", "user__full_name"))


class CaptainRemoveView(APIView):
    permission_classes = [IsAgency]

    def post(self, request, pk):
        captain = get_object_or_404(CaptainProfile, pk=pk, agency=my_agency(request))
        services.leave(captain, by="agency")
        bump_discovery()
        return Response({"removed": True})


class InviteListView(APIView):
    permission_classes = [IsAgency]

    def get(self, request):
        agency = my_agency(request)
        return Response(InviteSerializer(agency.invites.exclude(status=AgencyInvite.Status.ACCEPTED)[:50], many=True).data)

    def post(self, request):
        invite = services.invite(my_agency(request), str(request.data.get("phone_number", "")))
        return Response(InviteSerializer(invite).data, status=status.HTTP_201_CREATED)


class InviteCancelView(APIView):
    permission_classes = [IsAgency]

    def delete(self, request, pk):
        AgencyInvite.objects.filter(pk=pk, agency__owner=request.user, status=AgencyInvite.Status.PENDING).update(
            status=AgencyInvite.Status.CANCELLED, responded_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- trips & prices
class ServiceListView(generics.ListCreateAPIView):
    permission_classes = [IsAgency]
    serializer_class = AgencyServiceSerializer
    pagination_class = None

    def get_queryset(self):
        return AgencyService.objects.filter(agency__owner=self.request.user).select_related("city")

    def perform_create(self, serializer):
        agency = my_agency(self.request)
        services.require_active(agency)
        if agency.services.filter(is_active=True).count() >= 50:
            raise bad_request("You can list up to 50 active trips.", "limit")
        services.sync_service(serializer.save(agency=agency))
        bump_discovery()


class ServiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAgency]
    serializer_class = AgencyServiceSerializer

    def get_queryset(self):
        return AgencyService.objects.filter(agency__owner=self.request.user)

    def perform_update(self, serializer):
        services.sync_service(serializer.save())
        bump_discovery()

    def perform_destroy(self, instance):
        # Copies are kept (bookings point at them) but switched off.
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        services.sync_service(instance)
        bump_discovery()


class ServiceCoverView(APIView):
    permission_classes = [IsAgency]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    def post(self, request, pk):
        service = get_object_or_404(AgencyService, pk=pk, agency__owner=request.user)
        file = request.FILES.get("image")
        if not file:
            raise bad_request("Attach an image.", "file_required")
        service.cover_image.save(file.name, file, save=True)
        services.sync_service(service)
        return Response(AgencyServiceSerializer(service, context={"request": request}).data)


# ---------------------------------------------------------------- cars
class VehicleListView(generics.ListCreateAPIView):
    permission_classes = [IsAgency]
    serializer_class = AgencyVehicleSerializer
    pagination_class = None

    def get_queryset(self):
        return Vehicle.objects.filter(agency__owner=self.request.user).select_related("captain__user")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "agency": my_agency(self.request)}

    def perform_create(self, serializer):
        serializer.save(agency=my_agency(self.request))
        bump_discovery()


class VehicleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAgency]
    serializer_class = AgencyVehicleSerializer

    def get_queryset(self):
        return Vehicle.objects.filter(agency__owner=self.request.user)

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "agency": my_agency(self.request)}

    def perform_update(self, serializer):
        serializer.save()
        bump_discovery()


# ---------------------------------------------------------------- bookings
class BookingListView(generics.ListAPIView):
    """GET /agency/bookings/?status=requested|upcoming|active|past&captain=<id>"""

    permission_classes = [IsAgency]
    serializer_class = BookingListSerializer

    def get_queryset(self):
        qs = Booking.objects.filter(agency__owner=self.request.user).select_related("captain__user", "traveler", "service", "city")
        p = self.request.query_params
        today = timezone.localdate()
        st = p.get("status")
        if st == "requested":
            qs = qs.filter(status=Booking.Status.REQUESTED).order_by("request_expires_at")
        elif st == "upcoming":
            qs = qs.filter(status__in=[Booking.Status.ACCEPTED, Booking.Status.CONFIRMED], end_date__gte=today).order_by("start_date")
        elif st == "active":
            qs = qs.filter(status=Booking.Status.IN_PROGRESS)
        elif st == "past":
            qs = qs.exclude(status__in=Booking.ACTIVE).order_by("-start_date")
        if p.get("captain"):
            qs = qs.filter(captain_id=p["captain"])
        return qs

    def get_serializer_context(self):
        return _ctx(self)


def _booking(request, ref):
    qs = Booking.objects.filter(agency__owner=request.user).select_related("captain__user", "traveler", "service", "city", "agency")
    return get_object_or_404(qs, code=ref.upper()) if ref.upper().startswith("BKG-") else get_object_or_404(qs, pk=ref)


class BookingDetailView(APIView):
    permission_classes = [IsAgency]

    def get(self, request, ref):
        booking = _booking(request, ref)
        data = BookingDetailSerializer(booking, context={"request": request, "role": "agency"}).data
        data["candidates"] = [{"id": c.id, "code": c.code, "name": c.name, "rating_avg": c.rating_avg, "trips_completed": c.trips_completed}
                              for c in services.candidates(booking)]
        return Response(data)


class BookingActionView(APIView):
    """POST /agency/bookings/<ref>/<accept|decline|assign>/ — the agency acting for its Captains."""

    permission_classes = [IsAgency]

    def post(self, request, ref, action):
        booking = _booking(request, ref)
        if action == "accept":
            booking_services.accept(booking, request.user, role="agency")
        elif action == "decline":
            booking_services.decline(booking, request.user, str(request.data.get("reason", ""))[:300], role="agency")
        elif action == "assign":
            captain = get_object_or_404(CaptainProfile, pk=request.data.get("captain_id"), agency=booking.agency)
            services.reassign(booking, captain, request.user, "agency")
        else:
            raise bad_request("Unknown action.", "invalid")
        booking.refresh_from_db()
        return Response(BookingDetailSerializer(booking, context={"request": request, "role": "agency"}).data)


# ---------------------------------------------------------------- money
class WalletView(APIView):
    permission_classes = [IsAgency]

    def get(self, request):
        agency = my_agency(request)
        entries = LedgerEntry.objects.filter(agency=agency).select_related("booking", "captain__user")[:50]
        ledger = [{**LedgerSerializer(e).data, "captain_name": e.captain.name if e.captain else None} for e in entries]
        return Response({
            **payments.wallet(agency=agency),
            "ledger": ledger,
            "payouts": PayoutSerializer(Payout.objects.filter(agency=agency)[:20], many=True).data,
            "payout_account": getattr(getattr(agency, "payout_account", None), "masked", None),
        })


class RequestPayoutView(APIView):
    permission_classes = [IsAgency]

    def post(self, request):
        try:
            amount = int(request.data.get("amount", 0))
        except (TypeError, ValueError):
            amount = 0
        payout = payments.request_payout(agency=my_agency(request), amount=amount)
        return Response(PayoutSerializer(payout).data, status=status.HTTP_201_CREATED)


class EarningsView(APIView):
    """GET /agency/earnings/?month=YYYY-MM → each Captain's trips and earnings that month, plus the last 12 months."""

    permission_classes = [IsAgency]

    def get(self, request):
        agency = my_agency(request)
        month = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            year, mon = (int(x) for x in month.split("-"))
            timezone.datetime(year, mon, 1)
        except ValueError:
            raise bad_request("Month must look like 2026-11.", "invalid")
        earned = LedgerEntry.objects.filter(agency=agency, kind=LedgerEntry.Kind.TRIP_EARNING)
        rows = (earned.filter(created_at__year=year, created_at__month=mon)
                .values("captain_id", "captain__code", "captain__user__full_name")
                .annotate(trips=Count("id"), total=Sum("amount")).order_by("-total"))
        months = earned.annotate(m=TruncMonth("created_at")).values("m").annotate(total=Sum("amount")).order_by("-m")[:12]
        return Response({
            "month": f"{year:04d}-{mon:02d}",
            "by_captain": [{"captain_id": r["captain_id"], "code": r["captain__code"], "name": r["captain__user__full_name"],
                            "trips": r["trips"], "total": r["total"]} for r in rows],
            "total": sum(r["total"] for r in rows),
            "months": [{"month": r["m"].strftime("%Y-%m"), "total": r["total"]} for r in months],
        })


# ================================================================ Captain app: invites & membership
def _captain(request) -> CaptainProfile:
    profile = CaptainProfile.objects.select_related("user", "city", "agency").filter(user=request.user).first()
    if profile is None:
        raise conflict("Set up your business profile first.", "no_profile")
    return profile


class CaptainAgencyView(APIView):
    """GET /captain/agency/ → the agency the Captain works for (or null) and invites waiting for them."""

    permission_classes = [IsCaptain]

    def get(self, request):
        profile = CaptainProfile.objects.select_related("agency__city").filter(user=request.user).first()
        invites = (AgencyInvite.objects.filter(phone_number=request.user.phone_number, status=AgencyInvite.Status.PENDING,
                                               agency__review_status=Agency.ReviewStatus.APPROVED, agency__is_on_hold=False)
                   .select_related("agency__city"))
        a = profile.agency if profile else None
        return Response({
            "agency": {"id": a.id, "code": a.code, "name": a.name, "city_name": a.city.name, "joined_at": profile.agency_joined_at,
                       "logo": request.build_absolute_uri(a.logo.url) if a.logo else None} if a else None,
            "invites": [{"id": i.id, "agency": {"code": i.agency.code, "name": i.agency.name, "city_name": i.agency.city.name},
                         "created_at": i.created_at} for i in invites],
        })


class CaptainInviteView(APIView):
    """POST /captain/agency/invites/<id>/<accept|decline>/"""

    permission_classes = [IsCaptain]

    def post(self, request, pk, action):
        invite = get_object_or_404(AgencyInvite, pk=pk, phone_number=request.user.phone_number)
        if action == "accept":
            services.accept_invite(invite, _captain(request))
        elif action == "decline":
            services.decline_invite(invite)
        else:
            raise bad_request("Unknown action.", "invalid")
        bump_discovery()
        return CaptainAgencyView().get(request)


class CaptainLeaveView(APIView):
    permission_classes = [IsCaptain]

    def post(self, request):
        services.leave(_captain(request), by="captain")
        bump_discovery()
        return CaptainAgencyView().get(request)

