"""Admin: verify agencies and keep an eye on them (/api/v1/admin/agencies/…)."""
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.agencies.models import Agency, AgencyDocument
from apps.agencies.serializers import AgencySerializer
from apps.bookings.models import Booking
from apps.common.api import bad_request, conflict
from apps.notifications.service import notify
from apps.payments import services as payment_services

from .models import AdminAction, audit
from .serializers import AdminBookingRowSerializer, AuditSerializer
from .views import AdminList, AdminView


class AgencyRowSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True)
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    owner_phone = serializers.CharField(source="owner.phone_number", read_only=True)
    captain_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Agency
        fields = ["id", "code", "name", "city_name", "owner_name", "owner_phone", "review_status", "is_on_hold", "captain_count",
                  "submitted_at", "created_at"]


class AgencyDocumentAdminSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.CharField(source="get_doc_type_display", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = AgencyDocument
        fields = ["id", "doc_type", "doc_type_label", "number", "status", "note", "file_url", "created_at"]

    def get_file_url(self, obj):
        return f"/admin/agencies/documents/{obj.id}/file/"


class AgencyListView(AdminList):
    serializer_class = AgencyRowSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = Agency.objects.select_related("owner", "city").annotate(captain_count=Count("captains"))
        st = p.get("status")
        if st == "on_hold":
            qs = qs.filter(is_on_hold=True)
        elif st in Agency.ReviewStatus.values:
            qs = qs.filter(review_status=st)
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(code__iexact=q) | Q(name__icontains=q) | Q(owner__phone_number__contains=q))
        return qs.order_by("submitted_at" if st == "pending" else "-created_at")


def _agency(pk):
    return get_object_or_404(Agency.objects.select_related("owner", "city"), pk=pk)


def _detail(request, agency):
    data = AgencySerializer(agency, context={"request": request}).data
    data["documents"] = AgencyDocumentAdminSerializer(agency.documents.all(), many=True).data
    data["payout_account"] = getattr(getattr(agency, "payout_account", None), "masked", None)
    data["captains"] = [{"id": c.id, "code": c.code, "name": c.name, "city_name": c.city.name, "is_live": c.is_live,
                         "review_status": c.review_status} for c in agency.captains.select_related("user", "city")]
    data["services"] = agency.services.filter(is_active=True).count()
    data["wallet"] = payment_services.wallet(agency=agency)
    recent = Booking.objects.filter(agency=agency).select_related("traveler", "service", "city", "captain__user")[:10]
    data["recent_bookings"] = AdminBookingRowSerializer(recent, many=True, context={"request": request, "role": "admin"}).data
    data["audit"] = AuditSerializer(AdminAction.objects.filter(target_type="agency", target_id=str(agency.pk))[:20], many=True).data
    return data


class AgencyDetailView(AdminView):
    def get(self, request, pk):
        return Response(_detail(request, _agency(pk)))


class AgencyReviewView(AdminView):
    """POST {decision: approve|changes, note}"""

    def post(self, request, pk):
        agency = _agency(pk)
        decision = request.data.get("decision")
        note = str(request.data.get("note", "")).strip()[:500]
        if decision not in {"approve", "changes"}:
            raise bad_request("Choose approve or changes.", "invalid_decision")
        if agency.review_status != Agency.ReviewStatus.PENDING:
            raise conflict("This agency isn't awaiting review.", "not_pending")
        if decision == "changes" and not note:
            raise bad_request("Tell the agency what to fix.", "note_required")
        with transaction.atomic():
            if decision == "approve":
                agency.documents.filter(status=AgencyDocument.Status.PENDING).update(
                    status=AgencyDocument.Status.APPROVED, reviewed_at=timezone.now())
            agency.review_status = Agency.ReviewStatus.APPROVED if decision == "approve" else Agency.ReviewStatus.REJECTED
            agency.review_note = note if decision == "changes" else ""
            agency.reviewed_at = timezone.now()
            agency.save(update_fields=["review_status", "review_note", "reviewed_at", "updated_at"])
            audit(request.user, f"agency_{decision}", agency, note=note)
        if decision == "approve":
            notify(agency.owner, "agency", "agency_approved", "Your agency is approved 🎉",
                   "Add your trips and invite your Captains.", {})
        else:
            notify(agency.owner, "agency", "agency_changes", "A few changes needed", note, {})
        return Response(_detail(request, _agency(pk)))


class AgencyHoldView(AdminView):
    """POST {hold: bool, reason}. A held agency's Captains disappear from search and its payouts pause."""

    def post(self, request, pk):
        agency = _agency(pk)
        hold = bool(request.data.get("hold"))
        reason = str(request.data.get("reason", "")).strip()[:300]
        if hold and not reason:
            raise bad_request("Give a reason for the hold.", "reason_required")
        agency.is_on_hold = hold
        agency.hold_reason = reason if hold else ""
        agency.save(update_fields=["is_on_hold", "hold_reason", "updated_at"])
        audit(request.user, "agency_hold" if hold else "agency_release", agency, reason=reason)
        notify(agency.owner, "agency", "agency_on_hold" if hold else "agency_released",
               "Your agency is on hold" if hold else "Your agency is active again", reason or "Your Captains are bookable again.", {})
        return Response({"is_on_hold": agency.is_on_hold})


class AgencyDocumentFileView(AdminView):
    def get(self, request, pk):
        doc = get_object_or_404(AgencyDocument.objects.select_related("agency"), pk=pk)
        audit(request.user, "agency_document_view", doc.agency, doc_type=doc.doc_type)
        if doc.file.storage.__class__.__name__ == "FileSystemStorage":
            return FileResponse(doc.file.open("rb"), filename=doc.file.name.rsplit("/", 1)[-1])
        return HttpResponseRedirect(doc.file.url)


class AgencyDocumentReviewView(AdminView):
    def post(self, request, pk):
        doc = get_object_or_404(AgencyDocument.objects.select_related("agency__owner"), pk=pk)
        decision = request.data.get("decision")
        note = str(request.data.get("note", "")).strip()[:300]
        if decision not in {"approve", "reject"}:
            raise bad_request("Choose approve or reject.", "invalid_decision")
        if decision == "reject" and not note:
            raise bad_request("Say why it's rejected.", "note_required")
        doc.status = AgencyDocument.Status.APPROVED if decision == "approve" else AgencyDocument.Status.REJECTED
        doc.note = note
        doc.reviewed_at = timezone.now()
        doc.save(update_fields=["status", "note", "reviewed_at"])
        audit(request.user, f"agency_document_{decision}", doc.agency, doc_type=doc.doc_type, note=note)
        if decision == "reject":
            notify(doc.agency.owner, "agency", "document_rejected", f"{doc.get_doc_type_display()} needs a re-upload", note, {})
        return Response(AgencyDocumentAdminSerializer(doc).data)
