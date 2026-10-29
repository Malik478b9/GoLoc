"""
Admin console API (/api/v1/admin/…). Every write is recorded in AdminAction.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.http import FileResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.agencies.models import Agency
from apps.bookings import services as booking_services
from apps.bookings.models import Booking
from apps.captains.models import CaptainProfile, VerificationDocument
from apps.captains.services import refresh_rating
from apps.cities.models import City
from apps.common.api import bad_request, conflict
from apps.notifications.service import notify
from apps.payments import services as payment_services
from apps.payments.models import Payment, Payout, Refund
from apps.reviews.models import Review
from apps.social.models import Post
from apps.support.models import Ticket
from apps.trips.models import EmergencyService, SOSAlert
from apps.trips.services import latest_location

from . import serializers as s
from .models import AdminAction, audit

User = get_user_model()
B = Booking.Status


class AdminView(APIView):
    permission_classes = [IsAdmin]


class AdminList(generics.ListAPIView):
    permission_classes = [IsAdmin]


# ---------------------------------------------------------------- dashboard & lookup
class DashboardView(AdminView):
    def get(self, request):
        data = cache.get("admin:dash")
        if data is None:
            data = self._build()
            cache.set("admin:dash", data, 15)
        return Response(data)

    @staticmethod
    def _build():
        today = timezone.localdate()
        week_ago = timezone.now() - timedelta(days=7)
        two_weeks_ago = week_ago - timedelta(days=7)
        paid = Booking.objects.filter(status__in=Booking.PAID)
        gmv_week = paid.filter(confirmed_at__gte=week_ago).aggregate(s=Sum("total"))["s"] or 0
        gmv_prev = paid.filter(confirmed_at__gte=two_weeks_ago, confirmed_at__lt=week_ago).aggregate(s=Sum("total"))["s"] or 0
        rev_week = paid.filter(confirmed_at__gte=week_ago).aggregate(c=Sum("commission"), i=Sum("insurance_fee"), p=Sum("insurance_premium"))
        by_status = dict(Booking.objects.values_list("status").annotate(n=Count("id")))
        cities = (paid.filter(confirmed_at__gte=timezone.now() - timedelta(days=30)).values("city__name")
                  .annotate(gmv=Sum("total"), n=Count("id")).order_by("-gmv")[:6])
        return {
            "gmv_week": gmv_week,
            "gmv_change_pct": round((gmv_week - gmv_prev) * 100 / gmv_prev, 1) if gmv_prev else None,
            "commission_week": rev_week["c"] or 0,
            "insurance_margin_week": (rev_week["i"] or 0) - (rev_week["p"] or 0),
            "trips_today": Booking.objects.filter(status__in=[B.CONFIRMED, B.IN_PROGRESS, B.COMPLETED], start_date__lte=today, end_date__gte=today).count(),
            "trips_live": Booking.objects.filter(status=B.IN_PROGRESS).count(),
            "captains_live": CaptainProfile.objects.filter(is_live=True, is_on_hold=False).count(),
            "captains_pending": CaptainProfile.objects.filter(review_status=CaptainProfile.ReviewStatus.PENDING).count(),
            "documents_pending": VerificationDocument.objects.filter(status=VerificationDocument.Status.PENDING).count(),
            "captains_on_hold": CaptainProfile.objects.filter(is_on_hold=True).count(),
            "agencies_pending": Agency.objects.filter(review_status=Agency.ReviewStatus.PENDING).count(),
            "travelers": User.objects.filter(bookings__isnull=False).distinct().count(),
            "sos_open": SOSAlert.objects.filter(status__in=["open", "acknowledged"]).count(),
            "tickets_open": Ticket.objects.filter(status__in=["open", "in_review"]).count(),
            "payouts_pending": Payout.objects.filter(status=Payout.Status.REQUESTED).aggregate(n=Count("id"), s=Sum("amount")),
            "refunds_failed": Refund.objects.filter(status=Refund.Status.FAILED).count(),
            "bookings_by_status": by_status,
            "top_cities": list(cities),
        }


class LookupView(AdminView):
    """GET /admin/lookup/?q=CAP-1001 | BKG-8001 | PO-2001 | SOS-3001 | TKT-5001 | phone number (BR-7)"""

    def get(self, request):
        q = request.query_params.get("q", "").strip().upper()
        if not q:
            raise bad_request("Enter a CAP-, BKG-, PO-, SOS-, TKT- ID or a phone number.", "empty")
        found = []
        if q.startswith("CAP-") or q.isdigit() and len(q) == 4:
            code = q if q.startswith("CAP-") else f"CAP-{q}"
            found += [{"type": "captain", "id": c.id, "label": f"{c.code} · {c.name}"} for c in
                      CaptainProfile.objects.filter(code=code).select_related("user")]
        if q.startswith("AGY-"):
            found += [{"type": "agency", "id": a.id, "label": f"{a.code} · {a.name}"} for a in Agency.objects.filter(code=q)]
        if q.startswith("BKG-"):
            found += [{"type": "booking", "id": b.id, "label": f"{b.code} · {b.service_snapshot.get('title', '')}"} for b in
                      Booking.objects.filter(code=q)]
        if q.startswith("PO-"):
            found += [{"type": "payout", "id": p.id, "label": f"{p.code} · ₹{p.amount:,}"} for p in Payout.objects.filter(code=q)]
        if q.startswith("SOS-"):
            found += [{"type": "sos", "id": a.id, "label": a.code} for a in SOSAlert.objects.filter(code=q)]
        if q.startswith("TKT-"):
            found += [{"type": "ticket", "id": t.id, "label": f"{t.code} · {t.subject}"} for t in Ticket.objects.filter(code=q)]
        digits = "".join(ch for ch in q if ch.isdigit())
        if len(digits) >= 10:
            for u in User.objects.filter(phone_number__endswith=digits[-10:]).select_related("captain_profile"):
                found.append({"type": "user", "id": u.id, "label": f"{u.full_name or 'User'} · {u.phone_number}"})
                cp = getattr(u, "captain_profile", None)
                if cp:
                    found.append({"type": "captain", "id": cp.id, "label": f"{cp.code} · {cp.name}"})
        if not found and len(q) >= 3:
            found += [{"type": "captain", "id": c.id, "label": f"{c.code} · {c.name}"} for c in
                      CaptainProfile.objects.filter(user__full_name__icontains=q).select_related("user")[:10]]
        return Response({"query": q, "results": found})


# ---------------------------------------------------------------- captains & verification
class CaptainListView(AdminList):
    serializer_class = s.AdminCaptainRowSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = CaptainProfile.objects.select_related("user", "city")
        st = p.get("status")
        if st == "on_hold":
            qs = qs.filter(is_on_hold=True)
        elif st == "live":
            qs = qs.filter(is_live=True)
        elif st in CaptainProfile.ReviewStatus.values:
            qs = qs.filter(review_status=st)
        if p.get("city"):
            qs = qs.filter(city__slug=p["city"])
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(code__iexact=q) | Q(user__full_name__icontains=q) | Q(user__phone_number__contains=q))
        return qs.order_by("submitted_at" if st == "pending" else "-created_at")


def _captain(pk):
    return get_object_or_404(
        CaptainProfile.objects.select_related("user", "city", "payout_account").prefetch_related("documents", "services", "vehicles"),
        pk=pk)


class CaptainDetailView(AdminView):
    def get(self, request, pk):
        captain = _captain(pk)
        data = s.AdminCaptainDetailSerializer(captain, context={"request": request}).data
        data["wallet"] = payment_services.wallet(captain)
        recent = Booking.objects.filter(captain=captain).select_related("traveler", "service", "city", "captain__user")[:10]
        data["recent_bookings"] = s.AdminBookingRowSerializer(recent, many=True, context={"request": request, "role": "admin"}).data
        data["audit"] = s.AuditSerializer(AdminAction.objects.filter(target_type="captainprofile", target_id=str(pk))[:20], many=True).data
        return Response(data)


class CaptainReviewView(AdminView):
    """POST {decision: approve|changes, note}"""

    def post(self, request, pk):
        captain = _captain(pk)
        decision = request.data.get("decision")
        note = str(request.data.get("note", "")).strip()[:500]
        if decision not in {"approve", "changes"}:
            raise bad_request("Choose approve or changes.", "invalid_decision")
        if captain.review_status != CaptainProfile.ReviewStatus.PENDING:
            raise conflict("This profile isn't awaiting review.", "not_pending")
        if decision == "changes" and not note:
            raise bad_request("Tell the Captain what to fix.", "note_required")
        with transaction.atomic():
            if decision == "approve":
                pending = captain.documents.filter(status=VerificationDocument.Status.PENDING)
                pending.update(status=VerificationDocument.Status.APPROVED, reviewed_at=timezone.now())
            captain.review_status = (CaptainProfile.ReviewStatus.APPROVED if decision == "approve"
                                     else CaptainProfile.ReviewStatus.REJECTED)
            captain.review_note = note if decision == "changes" else ""
            captain.reviewed_at = timezone.now()
            captain.last_active_at = timezone.now()
            captain.save(update_fields=["review_status", "review_note", "reviewed_at", "last_active_at", "updated_at"])
            audit(request.user, f"captain_{decision}", captain, note=note)
        if decision == "approve":
            notify(captain.user, "captain", "captain_approved", "You're approved! 🎉", "Switch on Go live to start receiving bookings.", {})
        else:
            notify(captain.user, "captain", "captain_changes", "A few changes needed", note, {})
        return Response(s.AdminCaptainDetailSerializer(_captain(pk), context={"request": request}).data)


class CaptainHoldView(AdminView):
    """POST {hold: bool, reason} — BR-3 manual hold / release."""

    def post(self, request, pk):
        captain = _captain(pk)
        hold = bool(request.data.get("hold"))
        reason = str(request.data.get("reason", "")).strip()[:300]
        if hold and not reason:
            raise bad_request("Give a reason for the hold.", "reason_required")
        captain.is_on_hold = hold
        captain.hold_reason = reason if hold else ""
        if hold:
            captain.is_live = False
        else:
            captain.last_active_at = timezone.now()
        captain.save(update_fields=["is_on_hold", "hold_reason", "is_live", "last_active_at", "updated_at"])
        audit(request.user, "captain_hold" if hold else "captain_release", captain, reason=reason)
        notify(captain.user, "captain", "account_on_hold" if hold else "account_released",
               "Your account is on hold" if hold else "Your account is active again",
               reason or "You can go live again.", {})
        return Response({"is_on_hold": captain.is_on_hold, "is_live": captain.is_live})


class CaptainFeatureView(AdminView):
    def post(self, request, pk):
        captain = _captain(pk)
        captain.is_featured = bool(request.data.get("featured"))
        captain.save(update_fields=["is_featured", "updated_at"])
        audit(request.user, "captain_feature", captain, featured=captain.is_featured)
        return Response({"is_featured": captain.is_featured})


class CaptainVerifyView(AdminView):
    """Grant or remove the GoLoc Verified badge (manual now; tied to a paid plan later)."""

    def post(self, request, pk):
        captain = _captain(pk)
        captain.is_verified = bool(request.data.get("verified"))
        captain.save(update_fields=["is_verified", "updated_at"])
        audit(request.user, "captain_verify", captain, verified=captain.is_verified)
        return Response({"is_verified": captain.is_verified})


class DocumentQueueView(AdminList):
    serializer_class = s.AdminDocumentSerializer

    def get_queryset(self):
        st = self.request.query_params.get("status", "pending")
        return VerificationDocument.objects.filter(status=st).select_related("captain__user").order_by("created_at")


class DocumentFileView(AdminView):
    """Stream a KYC file to an admin (local disk) or redirect to a 5-minute signed URL (S3)."""

    def get(self, request, pk):
        doc = get_object_or_404(VerificationDocument.objects.select_related("captain"), pk=pk)
        audit(request.user, "document_view", doc.captain, doc_type=doc.doc_type)
        storage = doc.file.storage
        if storage.__class__.__name__ == "FileSystemStorage":
            return FileResponse(doc.file.open("rb"), filename=doc.file.name.rsplit("/", 1)[-1])
        return HttpResponseRedirect(doc.file.url)


class DocumentReviewView(AdminView):
    def post(self, request, pk):
        doc = get_object_or_404(VerificationDocument.objects.select_related("captain__user"), pk=pk)
        decision = request.data.get("decision")
        note = str(request.data.get("note", "")).strip()[:300]
        if decision not in {"approve", "reject"}:
            raise bad_request("Choose approve or reject.", "invalid_decision")
        if decision == "reject" and not note:
            raise bad_request("Say why it's rejected.", "note_required")
        doc.status = VerificationDocument.Status.APPROVED if decision == "approve" else VerificationDocument.Status.REJECTED
        doc.note = note
        doc.reviewed_at = timezone.now()
        doc.save(update_fields=["status", "note", "reviewed_at"])
        audit(request.user, f"document_{decision}", doc.captain, doc_type=doc.doc_type, note=note)
        if decision == "reject":
            notify(doc.captain.user, "captain", "document_rejected", f"{doc.get_doc_type_display()} needs a re-upload", note, {})
        return Response(s.AdminDocumentSerializer(doc, context={"request": request}).data)


# ---------------------------------------------------------------- bookings & money
class BookingListView(AdminList):
    serializer_class = s.AdminBookingRowSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = Booking.objects.select_related("captain__user", "traveler", "service", "city")
        if p.get("status") in B.values:
            qs = qs.filter(status=p["status"])
        if p.get("city"):
            qs = qs.filter(city__slug=p["city"])
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(code__iexact=q) | Q(captain__code__iexact=q) | Q(traveler__phone_number__contains=q)
                           | Q(traveler__full_name__icontains=q))
        return qs.order_by("-created_at")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "role": "admin"}


def _booking(ref):
    qs = Booking.objects.select_related("captain__user", "traveler", "service", "city").prefetch_related(
        "events", "refunds", "payments", "sos_alerts")
    ref = str(ref)
    return get_object_or_404(qs, code=ref.upper()) if ref.upper().startswith("BKG-") else get_object_or_404(qs, pk=ref)


class BookingDetailView(AdminView):
    def get(self, request, ref):
        booking = _booking(ref)
        data = s.AdminBookingDetailSerializer(booking, context={"request": request, "role": "admin"}).data
        data["captain_location"] = latest_location(booking, "captain")
        data["traveler_location"] = latest_location(booking, "traveler")
        return Response(data)


class BookingCancelView(AdminView):
    """POST {reason, refund_percent (0–100, default per policy as if Captain cancelled = 100)}"""

    def post(self, request, ref):
        booking = _booking(ref)
        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            raise bad_request("Give a reason.", "reason_required")
        try:
            pct = int(request.data.get("refund_percent", 100))
        except (TypeError, ValueError):
            pct = -1
        if not 0 <= pct <= 100:
            raise bad_request("Refund percent must be 0–100.", "invalid_percent")
        booking = booking_services.cancel(booking, request.user, "admin", reason, refund_percent=pct)
        audit(request.user, "booking_cancel", booking, reason=reason, refund_percent=pct)
        return Response(s.AdminBookingDetailSerializer(_booking(booking.pk), context={"request": request, "role": "admin"}).data)


class BookingCompleteView(AdminView):
    """Close a trip the Captain forgot to complete (credits their wallet)."""

    def post(self, request, ref):
        booking = booking_services.complete_trip(_booking(ref), request.user, role="admin")
        audit(request.user, "booking_complete", booking)
        return Response(s.AdminBookingDetailSerializer(_booking(booking.pk), context={"request": request, "role": "admin"}).data)


class PaymentListView(AdminList):
    serializer_class = s.PaymentSerializer

    def get_queryset(self):
        qs = Payment.objects.select_related("booking")
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs


class RefundListView(AdminList):
    serializer_class = s.RefundSerializer

    def get_queryset(self):
        qs = Refund.objects.select_related("booking")
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs


class PayoutListView(AdminList):
    serializer_class = s.AdminPayoutSerializer

    def get_queryset(self):
        qs = Payout.objects.select_related("captain__user", "agency", "processed_by")
        st = self.request.query_params.get("status")
        return qs.filter(status=st).order_by("created_at") if st else qs


class PayoutSettleView(AdminView):
    """POST {paid: bool, reference, note}"""

    def post(self, request, pk):
        payout = get_object_or_404(Payout, pk=pk)
        paid = bool(request.data.get("paid"))
        payout = payment_services.settle_payout(payout, paid, str(request.data.get("reference", "")),
                                                str(request.data.get("note", "")), request.user)
        audit(request.user, "payout_paid" if paid else "payout_failed", payout, reference=payout.reference)
        return Response(s.AdminPayoutSerializer(payout).data)


# ---------------------------------------------------------------- trust & safety
class SOSListView(AdminList):
    serializer_class = s.SOSSerializer

    def get_queryset(self):
        qs = SOSAlert.objects.select_related("booking__city", "raised_by")
        st = self.request.query_params.get("status")
        if st == "active":
            return qs.filter(status__in=["open", "acknowledged"])
        return qs.filter(status=st) if st else qs


class SOSDetailView(AdminView):
    def get(self, request, pk):
        alert = get_object_or_404(SOSAlert.objects.select_related("booking__captain__user", "booking__traveler", "booking__city", "raised_by"), pk=pk)
        b = alert.booking
        tp = getattr(b.traveler, "traveler_profile", None)
        return Response({
            **s.SOSSerializer(alert).data,
            "booking": {"id": b.id, "code": b.code, "title": b.service_snapshot.get("title"), "status": b.status},
            "captain": {"name": b.captain.name, "code": b.captain.code, "phone": b.captain.user.phone_number},
            "traveler": {"name": b.traveler.full_name, "phone": b.traveler.phone_number,
                         "emergency_contact": {"name": tp.emergency_contact_name, "phone": tp.emergency_contact_phone} if tp else None},
            "captain_location": latest_location(b, "captain"),
            "traveler_location": latest_location(b, "traveler"),
        })

    def post(self, request, pk):
        """{status: acknowledged|resolved|false_alarm, notes}"""
        alert = get_object_or_404(SOSAlert.objects.select_related("booking__traveler", "booking__captain__user"), pk=pk)
        new = request.data.get("status")
        if new not in {"acknowledged", "resolved", "false_alarm"}:
            raise bad_request("Choose acknowledged, resolved or false_alarm.", "invalid_status")
        now = timezone.now()
        alert.status = new
        alert.handled_by = request.user
        if request.data.get("notes"):
            alert.notes = (alert.notes + f"\n[{now:%d %b %H:%M}] " + str(request.data["notes"])[:1000]).strip()
        if new == "acknowledged" and not alert.acknowledged_at:
            alert.acknowledged_at = now
        if new in {"resolved", "false_alarm"}:
            alert.resolved_at = now
            alert.acknowledged_at = alert.acknowledged_at or now
        alert.save()
        audit(request.user, f"sos_{new}", alert)
        user = alert.raised_by
        notify(user, alert.role, "sos_update", f"SOS {alert.code}: {alert.get_status_display()}",
               "GoLoc safety team is on it." if new == "acknowledged" else "Marked resolved. Stay safe!", {"booking_id": alert.booking_id})
        return Response(s.SOSSerializer(alert).data)


class TicketListView(AdminList):
    serializer_class = s.TicketAdminSerializer

    def get_queryset(self):
        qs = Ticket.objects.select_related("booking", "raised_by")
        st = self.request.query_params.get("status")
        if st == "active":
            return qs.filter(status__in=["open", "in_review"])
        return qs.filter(status=st) if st else qs


class TicketResolveView(AdminView):
    """POST {status: in_review|resolved|closed, resolution, refund_amount?}"""

    def post(self, request, pk):
        ticket = get_object_or_404(Ticket.objects.select_related("booking", "raised_by"), pk=pk)
        new = request.data.get("status")
        if new not in {"in_review", "resolved", "closed"}:
            raise bad_request("Choose in_review, resolved or closed.", "invalid_status")
        resolution = str(request.data.get("resolution", "")).strip()[:2000]
        if new in {"resolved", "closed"} and not resolution:
            raise bad_request("Write the resolution the user will see.", "resolution_required")
        try:
            refund = int(request.data.get("refund_amount") or 0)
        except (TypeError, ValueError):
            refund = -1
        if refund < 0:
            raise bad_request("Refund must be a positive amount.", "invalid_amount")
        if refund:
            if not ticket.booking:
                raise bad_request("Refunds need a linked booking.", "no_booking")
            available = payment_services.refundable_total(ticket.booking)
            if refund > available:
                raise bad_request(f"Only ₹{available:,} is refundable on {ticket.booking.code}.", "over_refund")
            payment_services.refund(ticket.booking, refund, f"Dispute {ticket.code}", request.user)
        ticket.status = new
        ticket.resolution = resolution or ticket.resolution
        ticket.refund_amount += refund
        if new in {"resolved", "closed"}:
            ticket.resolved_by = request.user
            ticket.resolved_at = timezone.now()
        ticket.save()
        audit(request.user, f"ticket_{new}", ticket, refund=refund)
        notify(ticket.raised_by, ticket.role, "ticket_update", f"{ticket.code}: {ticket.get_status_display()}",
               resolution[:200] or "We're looking into it.", {"ticket_id": ticket.id})
        return Response(s.TicketAdminSerializer(ticket).data)


class ReviewListView(AdminList):
    serializer_class = s.ReviewAdminSerializer

    def get_queryset(self):
        qs = Review.objects.select_related("captain__user", "traveler", "booking")
        if self.request.query_params.get("low") == "1":
            qs = qs.filter(rating__lte=2)
        return qs


class ReviewHideView(AdminView):
    def post(self, request, pk):
        review = get_object_or_404(Review, pk=pk)
        review.is_hidden = bool(request.data.get("hidden"))
        review.hidden_reason = str(request.data.get("reason", ""))[:300]
        review.save(update_fields=["is_hidden", "hidden_reason"])
        refresh_rating(review.captain_id)
        audit(request.user, "review_hide" if review.is_hidden else "review_show", review, label=f"review {review.pk}")
        return Response(s.ReviewAdminSerializer(review).data)


class PostListView(AdminList):
    serializer_class = s.PostAdminSerializer

    def get_queryset(self):
        qs = Post.objects.exclude(status=Post.Status.DELETED).select_related("captain__user")
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs


class PostModerateView(AdminView):
    def post(self, request, pk):
        post = get_object_or_404(Post.objects.select_related("captain__user"), pk=pk)
        hide = bool(request.data.get("hidden"))
        post.status = Post.Status.HIDDEN if hide else Post.Status.PUBLISHED
        post.moderation_note = str(request.data.get("note", ""))[:300]
        post.save(update_fields=["status", "moderation_note"])
        audit(request.user, "post_hide" if hide else "post_restore", post, label=f"post by {post.captain.code}")
        if hide:
            notify(post.captain.user, "captain", "post_hidden", "A post was hidden", post.moderation_note or "It breaks content policy.", {})
        return Response(s.PostAdminSerializer(post, context={"request": request}).data)


# ---------------------------------------------------------------- platform
class UserListView(AdminList):
    serializer_class = s.UserAdminSerializer

    def get_queryset(self):
        qs = User.objects.select_related("captain_profile").order_by("-created_at")
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(phone_number__contains=q) | Q(full_name__icontains=q))
        return qs


class UserActiveView(AdminView):
    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.pk == request.user.pk:
            raise bad_request("You can't disable yourself.", "self")
        user.is_active = bool(request.data.get("is_active"))
        user.save(update_fields=["is_active"])
        if not user.is_active:
            CaptainProfile.objects.filter(user=user).update(is_live=False)
            from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
        audit(request.user, "user_enable" if user.is_active else "user_disable", user, label=user.phone_number)
        return Response(s.UserAdminSerializer(user).data)


class CityListView(generics.ListCreateAPIView):
    permission_classes = [IsAdmin]
    serializer_class = s.CityAdminSerializer
    pagination_class = None
    queryset = City.objects.all()

    def perform_create(self, serializer):
        city = serializer.save()
        cache.delete("cities:live")
        audit(self.request.user, "city_create", city, label=city.name)


class CityDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdmin]
    serializer_class = s.CityAdminSerializer
    queryset = City.objects.all()

    def perform_update(self, serializer):
        city = serializer.save()
        cache.delete("cities:live")
        audit(self.request.user, "city_update", city, label=city.name,
              changes={k: str(v) for k, v in serializer.validated_data.items()})


class EmergencyListView(generics.ListCreateAPIView):
    permission_classes = [IsAdmin]
    serializer_class = s.EmergencyAdminSerializer
    pagination_class = None
    queryset = EmergencyService.objects.select_related("city")


class EmergencyDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    serializer_class = s.EmergencyAdminSerializer
    queryset = EmergencyService.objects.all()


class AuditListView(AdminList):
    serializer_class = s.AuditSerializer
    queryset = AdminAction.objects.select_related("actor")
