import re
import shutil
import tempfile
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.bookings.models import Booking
from apps.bookings.services import expire_stale
from apps.captains.models import CaptainProfile
from apps.captains.services import apply_inactivity_holds
from apps.common import testing as t
from apps.notifications.models import Notification
from apps.payments.models import LedgerEntry, Payment, Payout, Refund

TMP = tempfile.mkdtemp(prefix="goloc-test-media-")
MEDIA = override_settings(
    MEDIA_ROOT=TMP,
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage", "OPTIONS": {"location": TMP}},
        "private": {"BACKEND": "django.core.files.storage.FileSystemStorage", "OPTIONS": {"location": TMP + "/private"}},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    },
    PAYMENT_GATEWAY="fake", PUSH_PROVIDER="log", PUBLIC_BASE_URL="http://testserver",
)


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


@MEDIA
class FlowBase(TestCase):
    def setUp(self):
        t.reset()
        self.captain = t.make_live_captain(price=3500)
        self.service = self.captain.services.get(kind="experience")
        self.cap = t.client_for(self.captain.user, "captain")
        self.traveler = t.make_user("Ananya Reddy")
        self.trav = t.client_for(self.traveler, "traveler")
        self.admin_user = t.make_user("Priya Ops", staff=True)
        self.admin = t.client_for(self.admin_user, "admin")

    def request(self, date=None, guests=2, **extra):
        res = self.trav.post("/api/v1/bookings/", {
            "service_id": str(self.service.id), "guests": guests, "start_date": str(date or t.next_weekday()), **extra},
            format="json")
        return res

    def pay(self, ref):
        res = self.trav.post(f"/api/v1/payments/bookings/{ref}/order/")
        self.assertEqual(res.status_code, 201, res.data)
        token = re.search(r"/pay/checkout/([^/]+)/", res.data["checkout_url"]).group(1)
        page = self.client.get(f"/pay/checkout/{token}/")
        self.assertContains(page, "TEST MODE")
        res = self.client.post("/api/v1/payments/verify/", {"token": token}, content_type="application/json")
        self.assertEqual(res.status_code, 200, res.content)
        return res

    def booked_and_paid(self, date=None):
        res = self.request(date)
        self.assertEqual(res.status_code, 201, res.data)
        code = res.data["code"]
        self.assertEqual(self.cap.post(f"/api/v1/bookings/{code}/accept/").status_code, 200)
        self.pay(code)
        return Booking.objects.get(code=code)


class HappyPathTests(FlowBase):
    def test_full_trip_lifecycle(self):
        # Discover → profile → quote
        res = self.client.get("/api/v1/captains/?city=hyderabad&category=food")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["results"][0]["code"], self.captain.code)
        self.assertEqual(res.data["results"][0]["from_price"], 3500)
        res = self.client.get(f"/api/v1/captains/{self.captain.code}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["services"]), 1)

        res = self.client.post("/api/v1/captains/quote/", {"service_id": str(self.service.id), "guests": 3}, format="json")
        # 3500 + 1 extra guest × 400; insurance 49 × 3 guests × 1 day; 18 % commission on fare only
        self.assertEqual(res.data["fare"], 3900)
        self.assertEqual(res.data["insurance_fee"], 147)
        self.assertEqual(res.data["total"], 4047)
        self.assertEqual(res.data["commission"], 702)
        self.assertEqual(res.data["captain_net"], 3198)

        # Request → accept
        res = self.request(guests=3, meeting_point="Charminar north gate")
        self.assertEqual(res.status_code, 201, res.data)
        code = res.data["code"]
        self.assertTrue(code.startswith("BKG-"))
        self.assertTrue(Notification.objects.filter(user=self.captain.user, kind="booking_requested").exists())
        self.assertEqual(self.cap.get("/api/v1/bookings/?filter=requests").data["count"], 1)

        res = self.cap.post(f"/api/v1/bookings/{code}/accept/")
        self.assertEqual(res.data["status"], "accepted")
        self.assertIsNone(res.data["traveler"].get("phone"), "phone is hidden until paid")

        # Pay (fake gateway, same flow as Razorpay)
        self.pay(code)
        res = self.trav.get(f"/api/v1/bookings/{code}/")
        self.assertEqual(res.data["status"], "confirmed")
        pin = res.data["start_pin"]
        self.assertRegex(pin, r"^\d{4}$")
        self.assertEqual(res.data["insurance_policy_no"], f"INS-{code}")
        self.assertTrue(res.data["share_url"].startswith("http://testserver/t/"))
        self.assertIn("phone", res.data["captain"])
        self.assertIsNone(self.cap.get(f"/api/v1/bookings/{code}/").data["start_pin"], "captain never sees the PIN")

        # Trip day: wrong PIN, then right PIN
        Booking.objects.filter(code=code).update(start_date=timezone.localdate(), end_date=timezone.localdate())
        self.assertEqual(self.cap.post(f"/api/v1/bookings/{code}/start/", {"pin": "0000" if pin != "0000" else "1111"}).status_code, 400)
        res = self.cap.post(f"/api/v1/bookings/{code}/start/", {"pin": pin})
        self.assertEqual(res.data["status"], "in_progress")

        # Live location + live view + SOS + admin handling
        res = self.cap.post(f"/api/v1/trips/{code}/location/", {"lat": 17.361564, "lng": 78.474665, "accuracy": 8}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        live = self.trav.get(f"/api/v1/trips/{code}/live/").data
        self.assertAlmostEqual(live["captain_location"]["lat"], 17.361564)
        self.assertTrue(any(e["phone"] == "112" for e in live["emergency"]))
        booking = Booking.objects.get(code=code)
        shared = self.client.get(f"/api/v1/trips/shared/{booking.share_token}/")
        self.assertEqual(shared.status_code, 200)

        res = self.trav.post(f"/api/v1/trips/{code}/sos/", {"message": "Feeling unsafe"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(Notification.objects.filter(user=self.admin_user, kind="sos_raised").exists())
        sos_list = self.admin.get("/api/v1/admin/sos/?status=active").data["results"]
        self.assertEqual(len(sos_list), 1)
        detail = self.admin.get(f"/api/v1/admin/sos/{sos_list[0]['id']}/").data
        self.assertAlmostEqual(detail["captain_location"]["lat"], 17.361564)
        res = self.admin.post(f"/api/v1/admin/sos/{sos_list[0]['id']}/", {"status": "resolved", "notes": "Called traveler, all ok"}, format="json")
        self.assertEqual(res.data["status"], "resolved")

        # Complete → BR-2 wallet credit only now
        self.assertEqual(LedgerEntry.objects.filter(captain=self.captain).count(), 0)
        res = self.cap.post(f"/api/v1/bookings/{code}/complete/")
        self.assertEqual(res.data["status"], "completed")
        wallet = self.cap.get("/api/v1/payments/wallet/").data
        self.assertEqual(wallet["available"], 3198)
        self.assertEqual(self.client.get("/api/v1/trips/shared/" + booking.share_token + "/").status_code, 404)

        # Review → rating
        res = self.trav.post("/api/v1/reviews/", {"booking_id": str(booking.id), "rating": 5, "comment": "Superb!"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.trav.post("/api/v1/reviews/", {"booking_id": str(booking.id), "rating": 4}, format="json").status_code, 409)
        self.captain.refresh_from_db()
        self.assertEqual(float(self.captain.rating_avg), 5.0)
        self.assertEqual(self.captain.trips_completed, 1)

        # Payout request → admin pays
        res = self.cap.post("/api/v1/payments/payouts/", {"amount": 3198}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.cap.get("/api/v1/payments/wallet/").data["available"], 0)
        self.assertEqual(self.cap.post("/api/v1/payments/payouts/", {"amount": 600}, format="json").status_code, 400)
        payout_id = res.data["id"]
        self.assertEqual(self.admin.post(f"/api/v1/admin/payouts/{payout_id}/settle/", {"paid": True}, format="json").status_code, 400)
        res = self.admin.post(f"/api/v1/admin/payouts/{payout_id}/settle/", {"paid": True, "reference": "UTR123456"}, format="json")
        self.assertEqual(res.data["status"], "paid")
        self.assertEqual(self.cap.get("/api/v1/payments/wallet/").data["paid_out"], 3198)

    def test_failed_payout_returns_money(self):
        booking = self.booked_and_paid()
        Booking.objects.filter(pk=booking.pk).update(status="in_progress")
        self.cap.post(f"/api/v1/bookings/{booking.code}/complete/")
        payout = self.cap.post("/api/v1/payments/payouts/", {"amount": 1000}, format="json").data
        self.admin.post(f"/api/v1/admin/payouts/{payout['id']}/settle/", {"paid": False, "note": "Wrong UPI"}, format="json")
        self.assertEqual(self.cap.get("/api/v1/payments/wallet/").data["available"], booking.captain_net)

    def test_package_tier_pricing(self):
        pkg = t.make_live_captain("Leh Host", package=True).services.get(kind="package")
        pkg.captain.weekly_slots.filter(weekday=6).update(is_available=False)
        res = self.trav.post("/api/v1/bookings/", {"service_id": str(pkg.id), "guests": 2, "tier": "medium",
                                                   "start_date": str(t.next_weekday(10))}, format="json")
        self.assertEqual(res.status_code, 409, "default slots are Mon–Sat; a 6-day trip spans a Sunday")
        pkg.captain.weekly_slots.update(is_available=True)
        res = self.trav.post("/api/v1/bookings/", {"service_id": str(pkg.id), "guests": 2, "tier": "medium",
                                                   "start_date": str(t.next_weekday(10))}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["fare"], 96000)
        self.assertEqual(res.data["total"], 96000 + 49 * 2 * 6)
        self.assertEqual((Booking.objects.get(code=res.data["code"]).end_date - Booking.objects.get(code=res.data["code"]).start_date).days, 5)


class RefundPolicyTests(FlowBase):
    def _cancel(self, booking, hours_before, client=None, role="traveler"):
        start = timezone.localtime() + timedelta(hours=hours_before)
        Booking.objects.filter(pk=booking.pk).update(start_date=start.date(), start_time=start.time())
        return (client or self.trav).post(f"/api/v1/bookings/{booking.code}/cancel/", {"reason": "Plans changed"}, format="json")

    def test_traveler_cancel_far_ahead_full_refund(self):
        b = self.booked_and_paid()
        res = self._cancel(b, 100)
        self.assertEqual(res.data["refund_percent"], 100)
        self.assertEqual(Refund.objects.get(booking=b).amount, b.total)
        self.assertEqual(Payment.objects.get(booking=b).status, "refunded")

    def test_traveler_cancel_30h_half_fare_plus_insurance(self):
        b = self.booked_and_paid()
        preview = self.trav.get(f"/api/v1/bookings/{b.code}/cancel-preview/")
        self.assertEqual(preview.status_code, 200)
        res = self._cancel(b, 30)
        self.assertEqual(res.data["refund_percent"], 50)
        self.assertEqual(Refund.objects.get(booking=b).amount, round(b.fare * 0.5) + b.insurance_fee)

    def test_traveler_cancel_last_minute_only_insurance(self):
        b = self.booked_and_paid()
        res = self._cancel(b, 2)
        self.assertEqual(res.data["refund_percent"], 0)
        self.assertEqual(Refund.objects.get(booking=b).amount, b.insurance_fee)

    def test_captain_cancel_always_full_refund(self):
        b = self.booked_and_paid()
        self.assertEqual(self.cap.post(f"/api/v1/bookings/{b.code}/cancel/").status_code, 400, "reason required")
        res = self._cancel(b, 2, client=self.cap)
        self.assertEqual(res.data["refund_percent"], 100)
        self.assertEqual(Refund.objects.get(booking=b).amount, b.total)
        self.assertTrue(Notification.objects.filter(user=self.admin_user, kind="captain_cancelled").exists())

    def test_unpaid_cancel_has_no_refund(self):
        res = self.request()
        r = self.trav.post(f"/api/v1/bookings/{res.data['code']}/cancel/", {}, format="json")
        self.assertEqual(r.data["status"], "cancelled")
        self.assertFalse(Refund.objects.exists())

    def test_admin_dispute_partial_refund(self):
        b = self.booked_and_paid()
        Booking.objects.filter(pk=b.pk).update(status="completed")
        ticket = self.trav.post("/api/v1/support/tickets/", {"category": "service", "subject": "Late by 2 hours",
                                                             "description": "Captain arrived late", "booking_id": str(b.id)}, format="json")
        self.assertEqual(ticket.status_code, 201, ticket.data)
        res = self.admin.post(f"/api/v1/admin/tickets/{ticket.data['id']}/", {"status": "resolved", "resolution": "Partial refund",
                                                                            "refund_amount": b.total + 1}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.admin.post(f"/api/v1/admin/tickets/{ticket.data['id']}/", {"status": "resolved", "resolution": "Partial refund",
                                                                            "refund_amount": 500}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Payment.objects.get(booking=b).refunded_amount, 500)


class RulesTests(FlowBase):
    def test_sos_and_tracking_need_payment(self):  # BR-5
        res = self.request()
        code = res.data["code"]
        self.assertEqual(self.trav.post(f"/api/v1/trips/{code}/sos/", {}, format="json").status_code, 409)
        self.cap.post(f"/api/v1/bookings/{code}/accept/")
        self.assertEqual(self.trav.get(f"/api/v1/trips/{code}/live/").status_code, 409)
        self.pay(code)
        self.assertEqual(self.trav.get(f"/api/v1/trips/{code}/live/").status_code, 200)

    def test_capacity_and_blocked_dates(self):
        date = t.next_weekday()
        b = self.booked_and_paid(date)
        other = t.client_for(t.make_user("Rahul"), "traveler")
        res = other.post("/api/v1/bookings/", {"service_id": str(self.service.id), "guests": 1, "start_date": str(date)}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertIn("fully booked", res.data["detail"])
        cal = self.client.get(f"/api/v1/captains/{self.captain.id}/calendar/?from={date}&days=3").data
        self.assertIn(date, cal["unavailable"])

        later = t.next_weekday(12)
        self.cap.post("/api/v1/captain/availability/blocked/", {"date": str(later), "reason": "Leave"}, format="json")
        self.assertEqual(self.request(later).status_code, 409)
        self.assertTrue(b.pk)

    def test_requests_can_be_accepted_only_once_capacity_allows(self):
        date = t.next_weekday()
        a = self.request(date).data["code"]
        other = t.client_for(t.make_user("Rahul"), "traveler")
        b = other.post("/api/v1/bookings/", {"service_id": str(self.service.id), "guests": 1, "start_date": str(date)}, format="json").data["code"]
        self.assertEqual(self.cap.post(f"/api/v1/bookings/{a}/accept/").status_code, 200)
        res = self.cap.post(f"/api/v1/bookings/{b}/accept/")
        self.assertEqual(res.status_code, 409)

    def test_role_and_ownership(self):
        code = self.request().data["code"]
        self.assertEqual(self.trav.post(f"/api/v1/bookings/{code}/accept/").status_code, 403)
        stranger = t.client_for(t.make_live_captain("Other Cap").user, "captain")
        self.assertEqual(stranger.get(f"/api/v1/bookings/{code}/").status_code, 404)
        self.assertEqual(stranger.post(f"/api/v1/bookings/{code}/accept/").status_code, 404)
        self.assertEqual(self.trav.get("/api/v1/admin/dashboard/").status_code, 403)
        own = t.client_for(self.captain.user, "traveler")
        res = own.post("/api/v1/bookings/", {"service_id": str(self.service.id), "guests": 1, "start_date": str(t.next_weekday())}, format="json")
        self.assertEqual(res.status_code, 400, "can't book yourself")

    def test_expiry(self):
        code = self.request().data["code"]
        Booking.objects.filter(code=code).update(request_expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(expire_stale(), 1)
        self.assertEqual(Booking.objects.get(code=code).status, "expired")

        code = self.request(t.next_weekday(8)).data["code"]
        self.cap.post(f"/api/v1/bookings/{code}/accept/")
        Booking.objects.filter(code=code).update(payment_due_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(expire_stale(), 1)
        res = self.trav.post(f"/api/v1/payments/bookings/{code}/order/")
        self.assertEqual(res.status_code, 409)

    def test_inactivity_hold_blocks_discovery_and_payout(self):  # BR-3
        CaptainProfile.objects.filter(pk=self.captain.pk).update(last_active_at=timezone.now() - timedelta(days=31))
        self.client.get("/api/v1/captains/?city=hyderabad")  # cached while live
        self.assertEqual(apply_inactivity_holds(), 1)
        self.assertEqual(self.client.get("/api/v1/captains/?city=hyderabad").data["count"], 0)
        LedgerEntry.objects.create(captain=self.captain, kind="adjustment", amount=5000)
        res = self.cap.post("/api/v1/payments/payouts/", {"amount": 1000}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(self.cap.post("/api/v1/captain/go-live/", {"is_live": True}, format="json").status_code, 409)
        self.admin.post(f"/api/v1/admin/captains/{self.captain.id}/hold/", {"hold": False}, format="json")
        self.assertEqual(self.cap.post("/api/v1/payments/payouts/", {"amount": 1000}, format="json").status_code, 201)
        self.assertEqual(Payout.objects.count(), 1)

    def test_admin_lookup(self):  # BR-7
        code = self.request().data["code"]
        res = self.admin.get(f"/api/v1/admin/lookup/?q={self.captain.code}")
        self.assertEqual(res.data["results"][0]["type"], "captain")
        res = self.admin.get(f"/api/v1/admin/lookup/?q={code.lower()}")
        self.assertEqual(res.data["results"][0]["type"], "booking")
        res = self.admin.get(f"/api/v1/admin/bookings/{code}/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("commission", res.data)

    def test_chat_masks_contacts_until_paid(self):
        convo = self.trav.post("/api/v1/chat/", {"captain_id": str(self.captain.id)}, format="json").data
        msg = self.trav.post(f"/api/v1/chat/{convo['id']}/messages/", {"body": "call me on 98765 43210 or a@b.com"}, format="json").data
        self.assertNotIn("98765", msg["body"])
        self.assertNotIn("a@b.com", msg["body"])
        inbox = self.cap.get("/api/v1/chat/").data["results"]
        self.assertEqual(inbox[0]["unread"], 1)
        self.cap.get(f"/api/v1/chat/{convo['id']}/messages/")
        self.assertEqual(self.cap.get("/api/v1/chat/").data["results"][0]["unread"], 0)
        self.booked_and_paid()
        msg = self.trav.post(f"/api/v1/chat/{convo['id']}/messages/", {"body": "98765 43210"}, format="json").data
        self.assertIn("98765", msg["body"])
        polled = self.cap.get(f"/api/v1/chat/{convo['id']}/messages/?after=0").data["messages"]
        self.assertEqual(len(polled), 2)


class GuideHireTests(FlowBase):
    """A local guide hired by the day for the traveler's own arrival → return dates."""

    def setUp(self):
        super().setUp()
        self.guide = t.make_live_captain("Ravi Guide", price=2000)
        self.guide.captain_type = CaptainProfile.Type.GUIDE
        self.guide.save(update_fields=["captain_type"])
        self.guide.weekly_slots.update(is_available=True)
        self.guide_service = self.guide.services.create(
            kind="guide", title="Hyderabad with a local", category="heritage", price=2000, included_guests=2,
            extra_guest_price=300, max_guests=6)

    def hire(self, start, end, guests=2):
        return self.trav.post("/api/v1/bookings/", {
            "service_id": str(self.guide_service.id), "guests": guests, "start_date": str(start), "end_date": str(end)},
            format="json")

    def test_priced_per_day_over_arrival_to_return(self):
        start = t.next_weekday(7)
        res = self.hire(start, start + timedelta(days=2), guests=3)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["fare"], (2000 + 300) * 3)
        self.assertEqual(res.data["total"], (2000 + 300) * 3 + 49 * 3 * 3)
        self.assertEqual(res.data["end_date"], str(start + timedelta(days=2)))
        quote = self.trav.post("/api/v1/captains/quote/", {
            "service_id": str(self.guide_service.id), "guests": 3, "start_date": str(start),
            "end_date": str(start + timedelta(days=2))}, format="json").data
        self.assertEqual((quote["days"], quote["fare"]), (3, res.data["fare"]))

    def test_return_before_arrival_or_too_long_refused(self):
        start = t.next_weekday(7)
        self.assertEqual(self.hire(start, start - timedelta(days=1)).data["code"], "dates_reversed")
        self.assertEqual(self.hire(start, start + timedelta(days=40)).data["code"], "too_many_days")

    def test_every_day_must_be_free(self):
        start = t.next_weekday(7)
        self.guide.blocked_dates.create(date=start + timedelta(days=1))
        res = self.hire(start, start + timedelta(days=2))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "unavailable")

    def test_guides_cannot_sell_packages_and_discovery_filters_by_type(self):
        guide_api = t.client_for(self.guide.user, "captain")
        res = guide_api.post("/api/v1/captain/services/", {
            "kind": "package", "title": "Week", "category": "heritage", "duration_days": 3,
            "normal_price": 1000, "medium_price": 2000, "lavish_price": 3000}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("kind", res.data["fields"])
        guides = self.client.get("/api/v1/captains/?type=guide").json()["results"]
        self.assertEqual([c["code"] for c in guides], [self.guide.code])
        self.assertTrue(guides[0]["has_guide"])
        captains = self.client.get("/api/v1/captains/?type=captain").json()["results"]
        self.assertNotIn(self.guide.code, [c["code"] for c in captains])
