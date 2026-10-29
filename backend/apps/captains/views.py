import hashlib
from datetime import timedelta

from django.conf import settings

from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.db import transaction
from django.db.models import Case, Exists, F, IntegerField, OuterRef, Q, Subquery, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCaptain, IsTraveler
from apps.bookings import pricing
from apps.cities.models import City
from apps.common.api import bad_request, conflict, role_of
from apps.common.files import validate_image
from apps.notifications.service import notify_admins

from . import services
from .models import BlockedDate, CaptainProfile, PayoutAccount, SavedCaptain, ServiceOffer, Vehicle, VerificationDocument
from .serializers import (CATEGORIES, LANGUAGES, BlockedDateSerializer, CaptainCardSerializer, CaptainDetailSerializer,
                          DocumentSerializer, MyProfileSerializer, PayoutAccountSerializer, PublicServiceSerializer,
                          ServiceSerializer, VehicleSerializer, WeeklySlotSerializer)


def my_profile(request) -> CaptainProfile:
    profile = CaptainProfile.objects.select_related("user", "city", "agency").filter(user=request.user).first()
    if profile is None:
        raise conflict("Set up your business profile first.", "no_profile")
    return profile


def _not_agency_managed(profile, what="trips and prices"):
    if profile.agency_id:
        raise conflict(f"{profile.agency.name} manages your {what}. Ask them to make changes.", "agency_managed")


# ================================================================ captain self-service
class OptionsView(APIView):
    """GET /captain/options/ — lists the apps use for pickers."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            "languages": LANGUAGES,
            "categories": CATEGORIES,
            "document_types": [{"value": v, "label": l} for v, l in VerificationDocument.DocType.choices],
            "vehicle_kinds": [{"value": v, "label": l} for v, l in Vehicle.Kind.choices],
            "captain_types": [{"value": v, "label": l} for v, l in CaptainProfile.Type.choices],
            "guide_max_days": settings.GUIDE_MAX_DAYS,
            "refund_schedule": pricing.refund_schedule_for_display(),
        })


class MyProfileView(APIView):
    """GET → profile or null. PUT creates on first call, updates after."""

    permission_classes = [IsCaptain]

    def get(self, request):
        profile = CaptainProfile.objects.select_related("user", "city").filter(user=request.user).first()
        if profile and timezone.now() - profile.last_active_at > timedelta(hours=6):
            profile.touch()
        return Response(MyProfileSerializer(profile, context={"request": request}).data if profile else None)

    def put(self, request):
        profile = CaptainProfile.objects.filter(user=request.user).first()
        s = MyProfileSerializer(profile, data=request.data, partial=profile is not None, context={"request": request})
        s.is_valid(raise_exception=True)
        if profile is None:
            data = dict(s.validated_data)
            user_data = data.pop("user", {})
            if user_data.get("full_name", "").strip():
                request.user.full_name = user_data["full_name"].strip()
                request.user.save(update_fields=["full_name"])
            profile = services.create_profile(request.user, **data)
        else:
            profile = s.save()
        return Response(MyProfileSerializer(profile, context={"request": request}).data)


class AvatarView(APIView):
    permission_classes = [IsCaptain]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    def post(self, request):
        profile = my_profile(request)
        file = request.FILES.get("avatar")
        if not file:
            raise bad_request("Attach a photo.", "file_required")
        try:
            validate_image(file)
        except Exception as exc:  # noqa: BLE001 — Django ValidationError → API error
            raise bad_request(exc.messages[0] if hasattr(exc, "messages") else str(exc), "invalid_file")
        profile.avatar.save(file.name, file, save=True)
        return Response(MyProfileSerializer(profile, context={"request": request}).data)


class ChecklistView(APIView):
    permission_classes = [IsCaptain]

    def get(self, request):
        return Response(services.checklist(my_profile(request)))


class SubmitView(APIView):
    permission_classes = [IsCaptain]

    def post(self, request):
        profile = my_profile(request)
        check = services.checklist(profile)
        if not check["can_submit"]:
            missing = [i["label"] for i in check["items"] if not i["done"] and i["key"] != "approved"]
            raise bad_request("Finish these first: " + "; ".join(missing) if missing else "Already submitted.", "incomplete")
        profile.review_status = CaptainProfile.ReviewStatus.PENDING
        profile.submitted_at = timezone.now()
        profile.review_note = ""
        profile.save(update_fields=["review_status", "submitted_at", "review_note", "updated_at"])
        notify_admins("captain_submitted", f"New Captain to verify · {profile.code}", f"{profile.name} · {profile.city.name}",
                      {"captain_id": profile.id})
        return Response(MyProfileSerializer(profile, context={"request": request}).data)


class GoLiveView(APIView):
    """POST {"is_live": true|false}"""

    permission_classes = [IsCaptain]

    def post(self, request):
        profile = my_profile(request)
        want = bool(request.data.get("is_live", not profile.is_live))
        if want:
            check = services.checklist(profile)
            if profile.is_on_hold:
                raise conflict("Your account is on hold. Contact GoLoc support.", "on_hold")
            if not check["can_go_live"]:
                raise conflict("You can go live once GoLoc approves your profile and documents.", "not_approved")
        profile.is_live = want
        profile.last_active_at = timezone.now()
        profile.save(update_fields=["is_live", "last_active_at", "updated_at"])
        return Response({"is_live": profile.is_live})


class ServiceListView(generics.ListCreateAPIView):
    permission_classes = [IsCaptain]
    serializer_class = ServiceSerializer
    pagination_class = None

    def get_queryset(self):
        return ServiceOffer.objects.filter(captain__user=self.request.user)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.request.method == "POST":
            ctx["captain"] = my_profile(self.request)
        return ctx

    def perform_create(self, serializer):
        profile = my_profile(self.request)
        _not_agency_managed(profile)
        if profile.services.filter(is_active=True).count() >= 20:
            raise bad_request("You can list up to 20 active services.", "limit")
        serializer.save(captain=profile)


class ServiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsCaptain]
    serializer_class = ServiceSerializer

    def get_queryset(self):
        return ServiceOffer.objects.filter(captain__user=self.request.user)

    def perform_update(self, serializer):
        _not_agency_managed(my_profile(self.request))
        serializer.save()

    def perform_destroy(self, instance):
        _not_agency_managed(my_profile(self.request))
        if instance.bookings.exists():  # keep history intact
            instance.is_active = False
            instance.save(update_fields=["is_active", "updated_at"])
        else:
            instance.delete()


class ServiceCoverView(APIView):
    permission_classes = [IsCaptain]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "upload"

    def post(self, request, pk):
        service = get_object_or_404(ServiceOffer, pk=pk, captain__user=request.user)
        _not_agency_managed(my_profile(request))
        file = request.FILES.get("image")
        if not file:
            raise bad_request("Attach an image.", "file_required")
        try:
            validate_image(file)
        except Exception as exc:  # noqa: BLE001
            raise bad_request(exc.messages[0] if hasattr(exc, "messages") else str(exc), "invalid_file")
        service.cover_image.save(file.name, file, save=True)
        return Response(ServiceSerializer(service, context={"request": request}).data)


class VehicleListView(generics.ListCreateAPIView):
    permission_classes = [IsCaptain]
    serializer_class = VehicleSerializer
    pagination_class = None

    def get_queryset(self):
        return Vehicle.objects.filter(captain__user=self.request.user)

    def perform_create(self, serializer):
        profile = my_profile(self.request)
        _not_agency_managed(profile, "vehicles")
        serializer.save(captain=profile)


class VehicleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsCaptain]
    serializer_class = VehicleSerializer

    def get_queryset(self):
        # An agency's car is the agency's to edit.
        return Vehicle.objects.filter(captain__user=self.request.user, agency__isnull=True)


class DocumentListView(generics.ListCreateAPIView):
    permission_classes = [IsCaptain]
    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser]
    pagination_class = None
    throttle_scope = "upload"

    def get_queryset(self):
        return VerificationDocument.objects.filter(captain__user=self.request.user)

    def perform_create(self, serializer):
        profile = my_profile(self.request)
        serializer.save(captain=profile)
        if profile.review_status == CaptainProfile.ReviewStatus.APPROVED:
            notify_admins("document_uploaded", f"Document to verify · {profile.code}",
                          serializer.instance.get_doc_type_display(), {"captain_id": profile.id})


class AvailabilityView(APIView):
    """GET weekly + blocked + capacity. PUT {"weekly": [...7], "max_bookings_per_day": n}"""

    permission_classes = [IsCaptain]

    def get(self, request):
        profile = my_profile(request)
        return Response(self._data(profile))

    def put(self, request):
        profile = my_profile(request)
        weekly = request.data.get("weekly")
        if weekly is not None:
            s = WeeklySlotSerializer(data=weekly, many=True)
            s.is_valid(raise_exception=True)
            with transaction.atomic():
                for row in s.validated_data:
                    profile.weekly_slots.update_or_create(weekday=row["weekday"], defaults=row)
        cap = request.data.get("max_bookings_per_day")
        if cap is not None:
            try:
                cap = int(cap)
            except (TypeError, ValueError):
                cap = 0
            if not 1 <= cap <= 10:
                raise bad_request("Daily capacity must be between 1 and 10.", "invalid_capacity")
            profile.max_bookings_per_day = cap
            profile.save(update_fields=["max_bookings_per_day", "updated_at"])
        return Response(self._data(profile))

    @staticmethod
    def _data(profile):
        today = timezone.localdate()
        return {
            "weekly": WeeklySlotSerializer(profile.weekly_slots.all(), many=True).data,
            "blocked": BlockedDateSerializer(profile.blocked_dates.filter(date__gte=today), many=True).data,
            "max_bookings_per_day": profile.max_bookings_per_day,
        }


class BlockedDateView(APIView):
    permission_classes = [IsCaptain]

    def post(self, request):
        profile = my_profile(request)
        s = BlockedDateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if s.validated_data["date"] < timezone.localdate():
            raise bad_request("Choose a future date.", "date_in_past")
        obj, _ = BlockedDate.objects.update_or_create(captain=profile, date=s.validated_data["date"],
                                                      defaults={"reason": s.validated_data.get("reason", "")})
        return Response(BlockedDateSerializer(obj).data, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        BlockedDate.objects.filter(pk=pk, captain__user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PayoutAccountView(APIView):
    permission_classes = [IsCaptain]

    def get(self, request):
        account = PayoutAccount.objects.filter(captain__user=request.user).first()
        return Response(PayoutAccountSerializer(account).data if account else None)

    def put(self, request):
        profile = my_profile(request)
        s = PayoutAccountSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        account, _ = PayoutAccount.objects.update_or_create(captain=profile, defaults=s.validated_data)
        return Response(PayoutAccountSerializer(account).data)


class DashboardView(APIView):
    permission_classes = [IsCaptain]

    def get(self, request):
        from apps.bookings.models import Booking
        from apps.bookings.serializers import BookingListSerializer
        from apps.payments.services import wallet

        profile = my_profile(request)
        today = timezone.localdate()
        bookings = Booking.objects.filter(captain=profile).select_related("traveler", "service", "city", "captain__user")
        upcoming = bookings.filter(status__in=[Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS], end_date__gte=today).order_by("start_date", "start_time")
        pending = bookings.filter(status=Booking.Status.REQUESTED).order_by("request_expires_at")
        from apps.social.models import Post

        reel_views = sum(Post.objects.filter(captain=profile, status="published").values_list("view_count", flat=True))
        return Response({
            "profile": MyProfileSerializer(profile, context={"request": request}).data,
            "checklist": services.checklist(profile),
            "wallet": wallet(profile),
            "upcoming": BookingListSerializer(upcoming[:5], many=True, context={"request": request, "role": "captain"}).data,
            "upcoming_count": upcoming.count(),
            "pending_requests": BookingListSerializer(pending[:5], many=True, context={"request": request, "role": "captain"}).data,
            "pending_count": pending.count(),
            "reel_views": reel_views,
        })


# ================================================================ public discovery
def bookable_captains():
    active = ServiceOffer.objects.filter(captain=OuterRef("pk"), is_active=True)
    price = active.annotate(p=Case(When(kind="package", then=F("normal_price")), default=F("price"),
                                   output_field=IntegerField())).order_by("p").values("p")[:1]
    return (
        CaptainProfile.objects.filter(is_live=True, is_on_hold=False, review_status=CaptainProfile.ReviewStatus.APPROVED,
                                      city__is_live=True)
        .filter(Q(agency__isnull=True) | Q(agency__review_status="approved", agency__is_on_hold=False))
        .filter(Exists(active))
        .select_related("user", "city", "agency")
        .annotate(from_price=Subquery(price, output_field=IntegerField()),
                  has_package=Exists(active.filter(kind="package")),
                  has_guide=Exists(active.filter(kind="guide")))
    )


def _saved_ids(request, ids):
    if role_of(request) != "traveler" or not ids:
        return set()
    return set(SavedCaptain.objects.filter(traveler=request.user, captain_id__in=ids).values_list("captain_id", flat=True))


class DiscoveryView(generics.ListAPIView):
    """
    GET /captains/?city=hyderabad&category=food&kind=package|experience|guide&type=captain|guide&language=Hindi&q=…
                  &guests=4&min_rating=4&min_trips=10&min_exp=5&verified=1&start=YYYY-MM-DD&end=YYYY-MM-DD
                  &sort=rating|price_low|price_high|trips|experience
    No city = every live city. With start (and end) only Captains free on every one of those days are listed.
    Public. Cached briefly per query since it's the hottest read in the app.
    """

    permission_classes = [AllowAny]
    serializer_class = CaptainCardSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = bookable_captains()
        if p.get("city"):
            qs = qs.filter(city__slug=p["city"])
        if p.get("category"):
            qs = qs.filter(Q(Exists(ServiceOffer.objects.filter(captain=OuterRef("pk"), is_active=True, category=p["category"])))
                           | Q(categories__icontains=f'"{p["category"]}"'))
        if p.get("kind") in ServiceOffer.Kind.values:
            qs = qs.filter(Exists(ServiceOffer.objects.filter(captain=OuterRef("pk"), is_active=True, kind=p["kind"])))
        if p.get("type") in CaptainProfile.Type.values:
            qs = qs.filter(captain_type=p["type"])
        if p.get("language"):
            qs = qs.filter(languages__icontains=f'"{p["language"][:30]}"')
        q = p.get("q", "").strip()[:60]
        if q:
            qs = qs.filter(Q(user__full_name__icontains=q) | Q(tagline__icontains=q) | Q(code__iexact=q)
                           | Q(city__name__icontains=q)
                           | Q(Exists(ServiceOffer.objects.filter(captain=OuterRef("pk"), is_active=True, title__icontains=q))))
        if p.get("guests", "").isdigit():
            qs = qs.filter(Exists(ServiceOffer.objects.filter(captain=OuterRef("pk"), is_active=True, max_guests__gte=int(p["guests"]))))
        if p.get("min_rating"):
            try:
                qs = qs.filter(rating_avg__gte=float(p["min_rating"]))
            except ValueError:
                pass
        if p.get("min_trips", "").isdigit():
            qs = qs.filter(trips_completed__gte=int(p["min_trips"]))
        if p.get("min_exp", "").isdigit():
            qs = qs.filter(years_experience__gte=int(p["min_exp"]))
        if p.get("verified") in {"1", "true"}:
            qs = qs.filter(is_verified=True)
        if p.get("max_price", "").isdigit():
            qs = qs.filter(from_price__lte=int(p["max_price"]))
        if p.get("start"):
            start, end = self._dates(p)
            capacity = dict(qs.values_list("pk", "max_bookings_per_day"))
            qs = qs.filter(pk__in=services.free_for_trip(capacity, start, end))
        order = {
            "rating": ["-rating_avg", "-rating_count"],
            "price_low": ["from_price", "-rating_avg"],
            "price_high": ["-from_price", "-rating_avg"],
            "trips": ["-trips_completed"],
            "experience": ["-years_experience", "-rating_avg"],
        }.get(p.get("sort"), ["-is_featured", "-is_verified", "-rating_avg", "-trips_completed", "code"])
        return qs.order_by(*order)

    @staticmethod
    def _dates(p):
        try:
            start = serializers.DateField().to_internal_value(p["start"])
            end = serializers.DateField().to_internal_value(p.get("end") or p["start"])
        except serializers.ValidationError:
            raise bad_request("Dates must look like 2026-11-20.", "invalid_dates")
        if start < timezone.localdate():
            raise bad_request("Choose today or a later date.", "date_in_past")
        if end < start:
            raise bad_request("Your departure must be on or after your arrival.", "dates_reversed")
        if (end - start).days >= 60:
            raise bad_request("Search up to 60 days at a time.", "too_many_days")
        return start, end

    def list(self, request, *args, **kwargs):
        from .signals import discovery_version

        # Host is part of the key: photo links are absolute, so a phone on the LAN and the PC get their own copy.
        key = f"disc:{discovery_version()}:" + hashlib.md5(f"{request.get_host()}{request.get_full_path()}".encode()).hexdigest()
        data = cache.get(key)
        if data is None:
            data = super().list(request, *args, **kwargs).data
            cache.set(key, data, 30)
        saved = _saved_ids(request, [c["id"] for c in data["results"]])
        results = [{**c, "saved": c["id"] in {str(s) for s in saved}} for c in data["results"]]
        return Response({**data, "results": results})


def _get_captain(id_or_code):
    qs = bookable_captains().prefetch_related("services", "vehicles")
    if str(id_or_code).upper().startswith("CAP-"):
        return get_object_or_404(qs, code=str(id_or_code).upper())
    try:
        return get_object_or_404(qs, pk=id_or_code)
    except DjangoValidationError as exc:  # malformed UUID
        raise Http404 from exc


class CaptainDetailView(APIView):
    """GET /captains/<id or CAP-code>/ — public profile with services, reels and reviews."""

    permission_classes = [AllowAny]

    def get(self, request, id_or_code):
        from apps.reviews.views import PublicReviewSerializer
        from apps.social.serializers import PostSerializer

        captain = _get_captain(id_or_code)
        viewer = str(request.user.pk) if request.user.is_authenticated else request.META.get("REMOTE_ADDR", "")
        if cache.add(f"pv:{captain.pk}:{viewer}", 1, 3600):
            CaptainProfile.objects.filter(pk=captain.pk).update(profile_views=F("profile_views") + 1)
        data = CaptainDetailSerializer(captain, context={"request": request}).data
        published = captain.posts.filter(status="published")
        posts = published.select_related("captain__user", "city")[:12]
        reviews = captain.reviews.filter(is_hidden=False).select_related("traveler")[:5]
        data["posts"] = PostSerializer(posts, many=True, context={"request": request}).data
        data["reviews"] = PublicReviewSerializer(reviews, many=True).data
        data["saved"] = bool(_saved_ids(request, [captain.pk]))
        from apps.itineraries.serializers import ItinerarySummarySerializer

        itineraries = captain.itineraries.filter(kind="template", is_published=True, status="ready")[:10]
        data["itineraries"] = ItinerarySummarySerializer(itineraries, many=True, context={"request": request}).data
        data["stats"] = {
            "trips_completed": captain.trips_completed,
            "rating_avg": captain.rating_avg,
            "reviews": captain.reviews.filter(is_hidden=False).count(),
            "reels": published.filter(kind="reel").count(),
            "photos": published.filter(kind="photo").count(),
            # Every finished plan, private ones included: shows how much planning they've done, not the plans.
            "itineraries_prepared": captain.itineraries.filter(status="ready").count(),
            "years_experience": captain.years_experience,
            "member_since": captain.created_at.date(),
        }
        return Response(data)


class PublicServiceView(APIView):
    """GET /captains/services/<id>/ — one bookable service with its Captain (booking screen)."""

    permission_classes = [AllowAny]

    def get(self, request, pk):
        service = get_object_or_404(ServiceOffer.objects.filter(is_active=True, captain__in=bookable_captains()), pk=pk)
        captain = bookable_captains().get(pk=service.captain_id)
        return Response({
            "service": PublicServiceSerializer(service, context={"request": request}).data,
            "captain": CaptainCardSerializer(captain, context={"request": request}).data,
            "refund_schedule": pricing.refund_schedule_for_display(),
            "insurance_fee_per_guest_day": settings.INSURANCE_FEE_PER_GUEST_DAY,
        })


class NextAvailableView(APIView):
    """GET /captains/<id>/next-available/?start=YYYY-MM-DD&days=3 → nearest free trips of that length."""

    permission_classes = [AllowAny]

    def get(self, request, id_or_code):
        captain = _get_captain(id_or_code)
        try:
            start = serializers.DateField().to_internal_value(request.query_params.get("start") or str(timezone.localdate()))
            days = min(max(int(request.query_params.get("days", 1)), 1), settings.GUIDE_MAX_DAYS)
        except (serializers.ValidationError, ValueError):
            raise bad_request("Give a start date and number of days.", "invalid")
        return Response({"options": services.nearest_available(captain, max(start, timezone.localdate()), days)})


class CaptainCalendarView(APIView):
    """
    GET /captains/<id>/calendar/?from=YYYY-MM-DD&days=60
    → unavailable dates (for pickers), every day's status (for the month view) and the weekly hours.
    """

    permission_classes = [AllowAny]

    def get(self, request, id_or_code):
        captain = _get_captain(id_or_code)
        try:
            start = serializers.DateField().to_internal_value(request.query_params.get("from") or str(timezone.localdate()))
        except serializers.ValidationError:
            start = timezone.localdate()
        days = min(max(int(request.query_params.get("days", 60) or 60), 1), 120)
        end = start + timedelta(days=days - 1)
        days_out = services.day_statuses(captain, start, end)
        return Response({
            "from": start, "to": end,
            "unavailable": [d["date"] for d in days_out if d["status"] != "free"],
            "days": days_out,
            "weekly": WeeklySlotSerializer(captain.weekly_slots.all(), many=True).data,
        })


def _trip_days(data, service):
    """Days for a quote: guide hire counts arrival → return; everything else has a fixed length."""
    if service.kind != "guide":
        return None
    try:
        start = serializers.DateField().to_internal_value(data.get("start_date"))
        end = serializers.DateField().to_internal_value(data.get("end_date") or data.get("start_date"))
    except serializers.ValidationError:
        return 1
    days = (end - start).days + 1
    if not 1 <= days <= settings.GUIDE_MAX_DAYS:
        raise bad_request(f"Choose a return date within {settings.GUIDE_MAX_DAYS} days of arrival.", "invalid_dates")
    return days


class QuoteView(APIView):
    """POST /captains/quote/ {service_id, tier, guests, start_date?, end_date?} → price breakdown before booking."""

    permission_classes = [AllowAny]

    def post(self, request):
        service = get_object_or_404(ServiceOffer, pk=request.data.get("service_id"), is_active=True)
        tier = request.data.get("tier") or ("normal" if service.kind == "package" else "standard")
        try:
            guests = int(request.data.get("guests", 1))
        except (TypeError, ValueError):
            guests = 0
        if not 1 <= guests <= service.max_guests:
            raise bad_request(f"Choose 1–{service.max_guests} guests.", "invalid_guests")
        if service.kind == "package" and tier not in {"normal", "medium", "lavish"}:
            raise bad_request("Choose Normal, Medium or Lavish.", "tier_required")
        return Response({**pricing.quote(service, tier, guests, _trip_days(request.data, service)).as_dict(),
                         "tier": tier, "guests": guests})


class MatchSerializer(serializers.Serializer):
    city = serializers.SlugRelatedField(slug_field="slug", queryset=City.objects.filter(is_live=True))
    start_date = serializers.DateField()
    end_date = serializers.DateField(required=False, allow_null=True)
    guests = serializers.IntegerField(min_value=1, max_value=20)
    kind = serializers.ChoiceField(choices=ServiceOffer.Kind.values)
    tier = serializers.ChoiceField(choices=["normal", "medium", "lavish"], required=False, default="medium")
    interests = serializers.ListField(child=serializers.ChoiceField(choices=CATEGORIES), required=False, default=list, max_length=8)
    languages = serializers.ListField(child=serializers.CharField(max_length=30), required=False, default=list, max_length=5)
    budget = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class MatchView(APIView):
    """
    POST /captains/match/ — Build My Trip. Ranks Captains in the city by how well
    their best-fitting service matches, with a live price and availability.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        s = MatchSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["start_date"] < timezone.localdate():
            raise bad_request("Choose today or a later date.", "date_in_past")
        tier = d["tier"] if d["kind"] == "package" else "standard"
        end_date = d.get("end_date") or d["start_date"]
        if end_date < d["start_date"]:
            raise bad_request("Your return date must be on or after your arrival date.", "dates_reversed")
        trip_days = (end_date - d["start_date"]).days + 1
        if d["kind"] == "guide" and trip_days > settings.GUIDE_MAX_DAYS:
            raise bad_request(f"A guide can be booked for up to {settings.GUIDE_MAX_DAYS} days at a time.", "too_many_days")
        candidates = (bookable_captains().filter(city=d["city"]).order_by("-rating_avg", "-trips_completed")
                      .prefetch_related("services", "weekly_slots"))[:40]
        results = []
        for captain in candidates:
            fits = [sv for sv in captain.services.all() if sv.is_active and sv.kind == d["kind"] and sv.max_guests >= d["guests"]
                    # a package must fit between the traveler's arrival and return
                    and not (sv.kind == "package" and d.get("end_date") and sv.duration_days > trip_days)]
            if not fits:
                continue
            best = max(fits, key=lambda sv: (sv.category in d["interests"], -sv.from_price))
            q = pricing.quote(best, tier, d["guests"], trip_days)
            end = d["start_date"] + timedelta(days=q.days - 1)
            reason = services.unavailable_reason(captain, d["start_date"], end)
            alternatives = services.nearest_available(captain, d["start_date"], q.days, count=2) if reason else []
            cats = set(captain.categories) | {sv.category for sv in fits}
            interest_score = len(cats & set(d["interests"])) / len(d["interests"]) if d["interests"] else 0.6
            lang_score = 1.0 if not d["languages"] or set(captain.languages) & set(d["languages"]) else 0.0
            budget_score = 1.0 if not d.get("budget") or q.total <= d["budget"] else 0.0
            score = (40 * interest_score + 20 * lang_score + 22 * float(captain.rating_avg or 4) / 5
                     + 8 * min(captain.trips_completed / 50, 1) + 10 * budget_score)
            results.append({
                "captain": CaptainCardSerializer(captain, context={"request": request}).data,
                "service": {"id": best.id, "title": best.title, "kind": best.kind, "category": best.category},
                "quote": q.as_dict(),
                "match": min(99, round(score)),
                "available": reason is None,
                "unavailable_reason": reason,
                "next_available": alternatives,
                "within_budget": bool(budget_score),
            })
        results.sort(key=lambda r: (not r["available"], -r["match"]))
        return Response({"tier": tier, "results": results[:20]})


class SavedListView(generics.ListAPIView):
    permission_classes = [IsTraveler]
    serializer_class = CaptainCardSerializer
    pagination_class = None

    def get_queryset(self):
        ids = SavedCaptain.objects.filter(traveler=self.request.user).values("captain_id")
        return bookable_captains().filter(pk__in=ids).order_by("-rating_avg")


class SaveToggleView(APIView):
    permission_classes = [IsTraveler]

    def post(self, request, pk):
        captain = get_object_or_404(CaptainProfile, pk=pk)
        SavedCaptain.objects.get_or_create(traveler=request.user, captain=captain)
        return Response({"saved": True})

    def delete(self, request, pk):
        SavedCaptain.objects.filter(traveler=request.user, captain_id=pk).delete()
        return Response({"saved": False})
