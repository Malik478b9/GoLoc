import re
from datetime import timedelta
from unittest import mock

from django.utils import timezone

from apps.bookings.groups import settle_undersubscribed
from apps.bookings.models import Booking, GroupTrip
from apps.bookings.services import expire_stale
from apps.common import testing as t
from apps.notifications.models import Notification
from apps.payments.models import LedgerEntry, Refund

from .test_flow import MEDIA, FlowBase


@MEDIA
class GroupTripTests(FlowBase):
    def setUp(self):
        super().setUp()
        self.date = t.next_weekday(6)
        self.other = t.make_user("Rahul Verma")
        self.trav2 = t.client_for(self.other, "traveler")

    def post_group(self, **extra):
        body = {"service_id": str(self.service.id), "start_date": str(self.date), "seats": 6, "min_seats": 3,
                "price_per_seat": 1200, "meeting_point": "Charminar gate", **extra}
        return self.cap.post("/api/v1/captain/groups/", body, format="json")

    def join(self, client, ref, guests=1, names=None):
        names = names or [f"Guest {i}" for i in range(1, guests + 1)]
        return client.post(f"/api/v1/groups/{ref}/join/", {"guests": guests, "guest_details": [{"name": n} for n in names]},
                           format="json")

    def pay_as(self, client, ref):
        res = client.post(f"/api/v1/payments/bookings/{ref}/order/")
        self.assertEqual(res.status_code, 201, res.data)
        token = re.search(r"/pay/checkout/([^/]+)/", res.data["checkout_url"]).group(1)
        res = self.client.post("/api/v1/payments/verify/", {"token": token}, content_type="application/json")
        self.assertEqual(res.status_code, 200, res.content)

    def test_strangers_join_pay_and_each_gets_their_own_trip(self):
        res = self.post_group()
        self.assertEqual(res.status_code, 201, res.data)
        gid, code = res.data["id"], res.data["code"]
        self.assertTrue(code.startswith("GRP-"))
        self.assertEqual(res.data["seats_left"], 6)

        # Travelers find it in the public list and on the Captain's profile.
        listed = self.trav.get("/api/v1/groups/", {"city": "hyderabad"}).data
        self.assertEqual([g["code"] for g in listed], [code])
        self.assertEqual(len(self.trav.get("/api/v1/groups/", {"captain": str(self.captain.id)}).data), 1)

        a = self.join(self.trav, code, guests=2, names=["Ananya Reddy", "Meera"])
        self.assertEqual(a.status_code, 201, a.data)
        self.assertEqual(a.data["status"], "accepted")  # no request step: straight to pay
        self.assertEqual(a.data["fare"], 2400)
        self.assertEqual(a.data["group"]["code"], code)
        b = self.join(self.trav2, gid, guests=1)
        self.assertEqual(b.status_code, 201, b.data)

        detail = self.trav.get(f"/api/v1/groups/{code}/").data
        self.assertEqual(detail["seats_taken"], 3)
        self.assertEqual(detail["seats_paid"], 0)
        self.assertFalse(detail["will_run"])
        self.assertEqual(detail["my_booking"]["code"], a.data["code"])

        self.pay_as(self.trav, a.data["code"])
        self.pay_as(self.trav2, b.data["code"])
        detail = self.trav.get(f"/api/v1/groups/{code}/").data
        self.assertEqual(detail["seats_paid"], 3)
        self.assertTrue(detail["will_run"])
        self.assertTrue(Notification.objects.filter(user=self.captain.user, kind="group_seat_paid").exists())

        # Each traveler has their own PIN; the Captain checks each in on the day.
        bk_a = Booking.objects.get(code=a.data["code"])
        bk_b = Booking.objects.get(code=b.data["code"])
        self.assertTrue(bk_a.start_pin and bk_b.start_pin)
        mine = self.cap.get(f"/api/v1/captain/groups/{gid}/").data
        self.assertEqual(len(mine["travelers"]), 2)
        self.assertNotIn("phone", str(mine["travelers"]))  # names only
        self.assertEqual(mine["earnings"], bk_a.captain_net + bk_b.captain_net)

        with mock.patch("django.utils.timezone.localdate", return_value=self.date):
            self.assertEqual(self.cap.post(f"/api/v1/bookings/{bk_a.code}/start/", {"pin": bk_a.start_pin}).status_code, 200)
            self.assertEqual(self.cap.post(f"/api/v1/bookings/{bk_b.code}/start/", {"pin": bk_b.start_pin}).status_code, 200)
            bk_a.refresh_from_db()
            bk_b.refresh_from_db()
            self.assertEqual(self.cap.post(f"/api/v1/bookings/{bk_a.code}/complete/", {"pin": bk_a.end_pin}).status_code, 200)
            self.assertEqual(self.cap.post(f"/api/v1/bookings/{bk_b.code}/complete/", {"pin": bk_b.end_pin}).status_code, 200)
        self.assertEqual(LedgerEntry.objects.filter(booking__group_id=gid).count(), 2)

    def test_seats_cannot_be_oversold_or_joined_twice(self):
        code = self.post_group(seats=3, min_seats=2).data["code"]
        self.assertEqual(self.join(self.trav, code, guests=2).status_code, 201)
        self.assertEqual(self.join(self.trav, code, guests=1).data["code"], "already_joined")
        res = self.join(self.trav2, code, guests=2)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "not_enough_seats")
        self.assertEqual(self.join(self.trav2, code, guests=1).status_code, 201)
        third = t.client_for(t.make_user("Sam"), "traveler")
        self.assertEqual(self.join(third, code).data["code"], "group_full")
        # A full trip drops out of the public list.
        self.assertEqual(self.trav.get("/api/v1/groups/").data, [])

    def test_unpaid_seats_are_released(self):
        code = self.post_group(seats=2, min_seats=2).data["code"]
        b = self.join(self.trav, code, guests=2).data
        self.assertEqual(self.join(self.trav2, code).data["code"], "group_full")
        Booking.objects.filter(code=b["code"]).update(payment_due_at=timezone.now() - timedelta(minutes=1))
        expire_stale()
        self.assertEqual(self.join(self.trav2, code).status_code, 201)

    def test_group_holds_the_captains_day(self):
        self.assertEqual(self.post_group().status_code, 201)
        # A private booking on the same day is refused (capacity 1)…
        res = self.request(self.date)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "unavailable")
        # …and so is a second group.
        self.assertEqual(self.post_group().data["code"], "unavailable")

    def test_captain_cancel_refunds_everyone_in_full(self):
        res = self.post_group()
        gid, code = res.data["id"], res.data["code"]
        a = self.join(self.trav, code, guests=2).data
        self.pay_as(self.trav, a["code"])
        self.join(self.trav2, code)  # held, not paid
        self.assertEqual(self.cap.post(f"/api/v1/captain/groups/{gid}/cancel/", {}).status_code, 400)
        res = self.cap.post(f"/api/v1/captain/groups/{gid}/cancel/", {"reason": "Heavy rain forecast"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["state"], "cancelled")
        paid = Booking.objects.get(code=a["code"])
        self.assertEqual(paid.status, "cancelled")
        self.assertEqual(paid.refund_percent, 100)
        self.assertEqual(sum(r.amount for r in Refund.objects.filter(booking=paid)), paid.total)
        self.assertFalse(Booking.objects.filter(group_id=gid, status__in=Booking.ACTIVE).exists())
        self.assertTrue(Notification.objects.filter(user=self.traveler, kind="booking_cancelled").exists())
        self.assertEqual(self.join(t.client_for(t.make_user("Late"), "traveler"), code).data["code"], "group_closed")
        # The day is free again.
        self.assertEqual(self.request(self.date).status_code, 201)

    def test_too_few_paid_seats_cancels_automatically(self):
        res = self.post_group(min_seats=3)
        gid, code = res.data["id"], res.data["code"]
        a = self.join(self.trav, code, guests=2).data
        self.pay_as(self.trav, a["code"])
        group = GroupTrip.objects.get(pk=gid)
        self.assertEqual(settle_undersubscribed(now=group.starts_at - timedelta(hours=30)), 0)
        self.assertEqual(settle_undersubscribed(now=group.starts_at - timedelta(hours=23)), 1)
        group.refresh_from_db()
        self.assertEqual(group.status, "cancelled")
        paid = Booking.objects.get(code=a["code"])
        self.assertEqual((paid.status, paid.refund_percent), ("cancelled", 100))
        self.assertTrue(Notification.objects.filter(user=self.captain.user, kind="group_cancelled").exists())

    def test_enough_paid_seats_keeps_it_running(self):
        res = self.post_group(min_seats=2)
        a = self.join(self.trav, res.data["code"], guests=2).data
        self.pay_as(self.trav, a["code"])
        group = GroupTrip.objects.get(pk=res.data["id"])
        self.assertEqual(settle_undersubscribed(now=group.starts_at - timedelta(hours=10)), 0)
        group.refresh_from_db()
        self.assertEqual(group.status, "open")

    def test_rules_for_posting(self):
        self.assertEqual(self.post_group(start_date=str(timezone.localdate())).data["code"], "too_soon")
        self.assertEqual(self.post_group(seats=3, min_seats=5).data["code"], "min_over_seats")
        self.assertEqual(self.join(self.cap, "GRP-9999").status_code, 403)
        own = self.post_group().data["code"]
        me_as_traveler = t.client_for(self.captain.user, "traveler")
        self.assertEqual(self.join(me_as_traveler, own).data["code"], "own_service")
        listing = self.cap.get("/api/v1/captain/groups/").data
        self.assertEqual(len(listing["upcoming"]), 1)
        self.assertTrue(listing["services"])
