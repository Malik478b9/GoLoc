import re
from datetime import timedelta

from django.utils import timezone

from apps.bookings.models import Booking, Coupon, GiftVoucher
from apps.bookings.services import expire_stale
from apps.common import testing as t
from apps.notifications.models import Notification
from apps.payments.models import Payment, Refund

from .test_flow import MEDIA, FlowBase


@MEDIA
class OfferTests(FlowBase):
    def accepted(self, date=None, guests=2):
        res = self.request(date or t.next_weekday(), guests=guests)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.cap.post(f"/api/v1/bookings/{res.data['code']}/accept/").status_code, 200)
        return Booking.objects.get(code=res.data["code"])

    def order_and_pay(self, code):
        res = self.trav.post(f"/api/v1/payments/bookings/{code}/order/")
        self.assertEqual(res.status_code, 201, res.data)
        token = re.search(r"/pay/checkout/([^/]+)/", res.data["checkout_url"]).group(1)
        self.assertEqual(self.client.post("/api/v1/payments/verify/", {"token": token}, content_type="application/json").status_code, 200)

    # ------------------------------------------------------------ FIRSTTRIP
    def test_first_trip_gets_10_percent_automatically_and_only_once(self):
        b = self.accepted()
        self.assertEqual(b.coupon.code, "FIRSTTRIP")
        self.assertEqual(b.discount, round(b.fare * 0.10))
        self.assertEqual(b.total, b.fare + b.insurance_fee - b.discount)
        net_before = b.captain_net
        self.order_and_pay(b.code)
        b.refresh_from_db()
        self.assertEqual(b.status, "confirmed")
        self.assertEqual(Payment.objects.get(booking=b).amount, b.total)
        self.assertEqual(b.captain_net, net_before)  # GoLoc pays the discount

        second = self.accepted(t.next_weekday(12))
        self.assertIsNone(second.coupon)
        res = self.trav.post(f"/api/v1/bookings/{second.code}/coupon/", {"code": "firsttrip"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "coupon_invalid")

    def test_first_trip_capped_at_500(self):
        self.service.price = 9000
        self.service.save()
        b = self.accepted()
        self.assertEqual(b.discount, 500)

    def test_unpaid_booking_frees_the_coupon(self):
        b = self.accepted()
        self.assertEqual(b.coupon.code, "FIRSTTRIP")
        Booking.objects.filter(pk=b.pk).update(payment_due_at=timezone.now() - timedelta(minutes=1))
        expire_stale()
        again = self.accepted(t.next_weekday(12))
        self.assertEqual(again.coupon.code, "FIRSTTRIP")

    def test_captain_never_sees_offers(self):
        b = self.accepted()
        data = self.cap.get(f"/api/v1/bookings/{b.code}/").data
        self.assertNotIn("discount", data)
        self.assertNotIn("coupon", data)
        self.assertEqual(data["captain_net"], b.captain_net)

    # ------------------------------------------------------------ codes from admin
    def test_admin_coupon_code_apply_swap_and_remove(self):
        res = self.admin.post("/api/v1/admin/coupons/", {"code": "diwali200", "title": "₹200 off", "kind": "flat", "value": 200,
                                                         "is_public": False, "per_user_limit": 1}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["code"], "DIWALI200")
        b = self.accepted()
        self.assertEqual(self.trav.post(f"/api/v1/bookings/{b.code}/coupon/", {"code": "NOPE"}).data["code"], "coupon_not_found")
        res = self.trav.post(f"/api/v1/bookings/{b.code}/coupon/", {"code": "diwali200"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["coupon"]["code"], res.data["discount"]), ("DIWALI200", 200))
        # Secret codes aren't listed, public ones are.
        offers = self.trav.get(f"/api/v1/bookings/{b.code}/offers/").data
        self.assertEqual([c["code"] for c in offers["coupons"] if c["code"] == "DIWALI200"], [])
        self.assertTrue(any(c["code"] == "FIRSTTRIP" and c["eligible"] for c in offers["coupons"]))
        res = self.trav.delete(f"/api/v1/bookings/{b.code}/coupon/")
        self.assertEqual((res.data["discount"], res.data["total"]), (0, b.fare + b.insurance_fee))
        listed = self.admin.get("/api/v1/admin/coupons/").data
        self.assertEqual(next(c for c in listed if c["code"] == "DIWALI200")["uses"], 0)

    def test_coupons_only_change_before_payment(self):
        b = self.accepted()
        self.order_and_pay(b.code)
        res = self.trav.delete(f"/api/v1/bookings/{b.code}/coupon/")
        self.assertEqual(res.data["code"], "not_payable")

    def test_paying_an_old_order_after_offers_changed_is_refunded(self):
        b = self.accepted()
        self.trav.delete(f"/api/v1/bookings/{b.code}/coupon/")
        res = self.trav.post(f"/api/v1/payments/bookings/{b.code}/order/")
        token = re.search(r"/pay/checkout/([^/]+)/", res.data["checkout_url"]).group(1)
        self.trav.post(f"/api/v1/bookings/{b.code}/coupon/", {"code": "FIRSTTRIP"})  # price drops after the order
        self.client.post("/api/v1/payments/verify/", {"token": token}, content_type="application/json")
        b.refresh_from_db()
        self.assertEqual(b.status, "accepted")
        self.assertTrue(Refund.objects.filter(booking=b).exists())

    # ------------------------------------------------------------ PAY3GET4
    def post_group(self, date):
        res = self.cap.post("/api/v1/captain/groups/", {"service_id": str(self.service.id), "start_date": str(date), "seats": 10,
                                                        "min_seats": 2, "price_per_seat": 1200}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data["code"]

    def join(self, code, guests):
        res = self.trav.post(f"/api/v1/groups/{code}/join/", {"guests": guests,
                                                             "guest_details": [{"name": f"Guest {i}"} for i in range(guests)]}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_pay_3_get_4_once_per_traveler(self):
        g1 = self.post_group(t.next_weekday(6))
        three = self.join(g1, 3)
        self.assertNotEqual((three["coupon"] or {}).get("code"), "PAY3GET4")
        self.trav.post(f"/api/v1/bookings/{three['code']}/cancel/", {"reason": "more friends"})
        four = self.join(g1, 4)
        self.assertEqual(four["coupon"]["code"], "PAY3GET4")  # beats FIRSTTRIP (₹480) here
        self.assertEqual(four["discount"], 1200)
        self.assertEqual(four["total"], 3600 + four["insurance_fee"])
        self.order_and_pay(four["code"])
        g2 = self.post_group(t.next_weekday(13))
        again = self.join(g2, 4)
        self.assertNotEqual((again["coupon"] or {}).get("code"), "PAY3GET4")
        res = self.trav.post(f"/api/v1/bookings/{again['code']}/coupon/", {"code": "PAY3GET4"})
        self.assertIn("already used", res.data["detail"])

    def test_free_seat_is_not_for_private_trips(self):
        b = self.accepted(guests=4)
        res = self.trav.post(f"/api/v1/bookings/{b.code}/coupon/", {"code": "PAY3GET4"})
        self.assertEqual(res.status_code, 400)

    # ------------------------------------------------------------ gift vouchers
    def send_voucher(self, phones, amount):
        res = self.admin.post("/api/v1/admin/vouchers/", {"phones": phones, "amount": amount, "message": "Happy Diwali!"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_voucher_part_pays_and_balance_carries_over(self):
        sent = self.send_voucher(f"{self.traveler.phone_number}, 9876500099", 1000)
        self.assertEqual(len(sent), 2)
        self.assertTrue(Notification.objects.filter(user=self.traveler, kind="voucher_received").exists())
        mine = self.trav.get("/api/v1/vouchers/").data
        self.assertEqual(len(mine), 1)
        code = mine[0]["code"]
        b = self.accepted()
        due = b.total
        res = self.trav.post(f"/api/v1/bookings/{b.code}/voucher/", {"code": code})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["voucher_amount"], res.data["total"]), (1000, due - 1000))
        self.assertEqual(GiftVoucher.objects.get(code=code).balance, 0)
        # Removing gives it back; applying again takes it again.
        self.trav.delete(f"/api/v1/bookings/{b.code}/voucher/")
        self.assertEqual(GiftVoucher.objects.get(code=code).balance, 1000)
        self.trav.post(f"/api/v1/bookings/{b.code}/voucher/", {"code": code})
        self.order_and_pay(b.code)
        b.refresh_from_db()
        self.assertEqual(Payment.objects.get(booking=b).amount, due - 1000)
        # Someone else can't use it.
        other = t.client_for(t.make_user("Stranger"), "traveler")
        self.assertEqual(other.get("/api/v1/vouchers/").data, [])

    def test_voucher_covers_everything_no_card_needed(self):
        code = self.send_voucher(self.traveler.phone_number, 10000)[0]["code"]
        b = self.accepted()
        res = self.trav.post(f"/api/v1/bookings/{b.code}/voucher/", {"code": code})
        self.assertEqual(res.data["total"], 0)
        res = self.trav.post(f"/api/v1/payments/bookings/{b.code}/order/")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["paid"])
        b.refresh_from_db()
        self.assertEqual(b.status, "confirmed")
        self.assertTrue(b.start_pin)
        self.assertEqual(GiftVoucher.objects.get(code=code).balance, 10000 - b.voucher_amount)

    def test_captain_cancel_puts_voucher_share_back(self):
        code = self.send_voucher(self.traveler.phone_number, 1000)[0]["code"]
        b = self.accepted()
        self.trav.post(f"/api/v1/bookings/{b.code}/voucher/", {"code": code})
        self.order_and_pay(b.code)
        b.refresh_from_db()
        self.assertEqual(self.cap.post(f"/api/v1/bookings/{b.code}/cancel/", {"reason": "Sick"}).status_code, 200)
        self.assertEqual(GiftVoucher.objects.get(code=code).balance, 1000)
        self.assertEqual(sum(r.amount for r in Refund.objects.filter(booking=b)), b.total)

    def test_expired_or_cancelled_voucher_cant_be_used(self):
        v = self.send_voucher(self.traveler.phone_number, 500)[0]
        self.admin.post(f"/api/v1/admin/vouchers/{v['id']}/cancel/")
        b = self.accepted()
        self.assertEqual(self.trav.post(f"/api/v1/bookings/{b.code}/voucher/", {"code": v["code"]}).data["code"], "voucher_cancelled")
        v2 = self.send_voucher(self.traveler.phone_number, 500)[0]
        GiftVoucher.objects.filter(pk=v2["id"]).update(expires_at=timezone.now() - timedelta(days=1))
        self.assertEqual(self.trav.post(f"/api/v1/bookings/{b.code}/voucher/", {"code": v2["code"]}).data["code"], "voucher_expired")
        self.assertEqual(self.admin.post("/api/v1/admin/vouchers/", {"phones": "123", "amount": 500}, format="json").data["code"], "bad_phone")
