import re
import shutil
import tempfile

from django.test import TestCase, override_settings

from apps.agencies.models import Agency
from apps.bookings.models import Booking
from apps.captains.models import CaptainProfile, ServiceOffer
from apps.common import testing as t
from apps.payments.models import LedgerEntry

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
class AgencyFlowTests(TestCase):
    def setUp(self):
        t.reset()
        self.owner = t.make_user("Ravi Travels Owner")
        self.ag = t.client_for(self.owner, "agency")
        self.admin = t.client_for(t.make_user("Priya Ops", staff=True), "admin")
        self.traveler = t.make_user("Ananya Reddy")
        self.trav = t.client_for(self.traveler, "traveler")

    # ------------------------------------------------------------ helpers
    def register_and_approve(self):
        res = self.ag.put("/api/v1/agency/profile/", {"name": "Ravi Travels", "city_id": str(t.city().id), "address": "Banjara Hills",
                                                       "pan": "abcde1234f", "gstin": "36ABCDE1234F1Z5"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["pan"], "ABCDE1234F")
        self.assertFalse(res.data["checklist"]["can_submit"])
        for doc in ("registration", "pan_card", "owner_id"):
            r = self.ag.post("/api/v1/agency/documents/", {"doc_type": doc, "file": t.pdf()}, format="multipart")
            self.assertEqual(r.status_code, 201, r.data)
        self.ag.put("/api/v1/agency/payout-account/", {"method": "upi", "account_holder": "Ravi Travels", "upi_id": "ravi@okbank"},
                    format="json")
        self.assertEqual(self.ag.post("/api/v1/agency/submit/").status_code, 200)
        agency = Agency.objects.get(owner=self.owner)
        res = self.admin.post(f"/api/v1/admin/agencies/{agency.id}/review/", {"decision": "approve"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return Agency.objects.get(pk=agency.pk)

    def join(self, captain):
        self.assertEqual(self.ag.post("/api/v1/agency/invites/", {"phone_number": captain.user.phone_number}, format="json").status_code, 201)
        cap = t.client_for(captain.user, "captain")
        mine = cap.get("/api/v1/captain/agency/").data
        self.assertEqual(len(mine["invites"]), 1)
        res = cap.post(f"/api/v1/captain/agency/invites/{mine['invites'][0]['id']}/accept/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["agency"]["name"], "Ravi Travels")
        return cap

    def add_trip(self, **extra):
        res = self.ag.post("/api/v1/agency/services/", {"kind": "experience", "title": "Charminar Night Walk", "category": "heritage",
                                                        "price": 2500, "included_guests": 2, "extra_guest_price": 300, "max_guests": 6,
                                                        **extra}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def pay(self, code):
        res = self.trav.post(f"/api/v1/payments/bookings/{code}/order/")
        token = re.search(r"/pay/checkout/([^/]+)/", res.data["checkout_url"]).group(1)
        self.client.post("/api/v1/payments/verify/", {"token": token}, content_type="application/json")

    # ------------------------------------------------------------ tests
    def test_agency_needs_approval_before_inviting(self):
        self.ag.put("/api/v1/agency/profile/", {"name": "Ravi Travels", "city_id": str(t.city().id)}, format="json")
        res = self.ag.post("/api/v1/agency/invites/", {"phone_number": "9876543210"}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(t.client_for(self.owner, "captain").get("/api/v1/agency/dashboard/").status_code, 403, "agency-only API")

    def test_full_agency_trip_money_goes_to_agency(self):
        agency = self.register_and_approve()
        rohit = t.make_live_captain("Rohit Agency")
        own = rohit.services.get()
        cap = self.join(rohit)
        own.refresh_from_db()
        self.assertFalse(own.is_active, "the agency sets trips now; own listings go quiet")
        trip = self.add_trip()
        copy = ServiceOffer.objects.get(captain=rohit, agency_service_id=trip["id"])
        self.assertEqual(copy.price, 2500)

        # The Captain can't change agency prices; the agency can, and the copy follows.
        self.assertEqual(cap.patch(f"/api/v1/captain/services/{copy.id}/", {"price": 100}, format="json").status_code, 409)
        self.ag.patch(f"/api/v1/agency/services/{trip['id']}/", {"price": 2800}, format="json")
        copy.refresh_from_db()
        self.assertEqual(copy.price, 2800)

        # Travelers find them with the agency's name.
        card = self.client.get(f"/api/v1/captains/?q={rohit.code}").data["results"][0]
        self.assertEqual((card["agency_name"], card["from_price"]), ("Ravi Travels", 2800))

        res = self.trav.post("/api/v1/bookings/", {"service_id": str(copy.id), "guests": 2, "start_date": str(t.next_weekday())},
                             format="json")
        self.assertEqual(res.status_code, 201, res.data)
        code = res.data["code"]
        self.assertEqual(Booking.objects.get(code=code).agency_id, agency.id)
        # The agency sees and accepts it for Rohit.
        self.assertEqual(self.ag.get("/api/v1/agency/bookings/?status=requested").data["count"], 1)
        self.assertEqual(self.ag.post(f"/api/v1/agency/bookings/{code}/accept/").status_code, 200)
        self.pay(code)
        Booking.objects.filter(code=code).update(status="in_progress")
        self.assertEqual(cap.post(f"/api/v1/bookings/{code}/complete/").status_code, 200)

        booking = Booking.objects.get(code=code)
        entry = LedgerEntry.objects.get(booking=booking)
        self.assertEqual((entry.agency_id, entry.captain_id), (agency.id, rohit.id))
        wallet = self.ag.get("/api/v1/agency/wallet/").data
        self.assertEqual(wallet["available"], booking.captain_net)
        self.assertEqual(booking.commission + booking.captain_net, booking.fare, "same commission as everyone")
        mine = cap.get("/api/v1/payments/wallet/").data
        self.assertEqual(mine["available"], 0, "the agency pays its Captains, not GoLoc")
        self.assertEqual(mine["agency_earned"], booking.captain_net)
        self.assertTrue(mine["ledger"][0]["paid_to_agency"], "the Captain still sees the trip they did")
        earnings = self.ag.get("/api/v1/agency/earnings/").data
        self.assertEqual(earnings["by_captain"][0]["code"], rohit.code)

        # Payout to the agency's account, settled by GoLoc admin.
        res = self.ag.post("/api/v1/agency/wallet/payout/", {"amount": booking.captain_net}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["destination"], "ravi@okbank")
        payout = self.admin.get("/api/v1/admin/payouts/?status=requested").data["results"][0]
        self.assertEqual((payout["captain_name"], payout["is_agency"]), ("Ravi Travels", True))
        self.admin.post(f"/api/v1/admin/payouts/{payout['id']}/settle/", {"paid": True, "reference": "UTR123"}, format="json")
        self.assertEqual(self.ag.get("/api/v1/agency/wallet/").data["paid_out"], booking.captain_net)

    def test_decline_passes_to_a_free_colleague_and_agency_can_reassign(self):
        self.register_and_approve()
        a, b = t.make_live_captain("Arjun"), t.make_live_captain("Bhavna")
        cap_a = self.join(a)
        self.join(b)
        trip = self.add_trip()
        copy_a = ServiceOffer.objects.get(captain=a, agency_service_id=trip["id"])
        code = self.trav.post("/api/v1/bookings/", {"service_id": str(copy_a.id), "guests": 2, "start_date": str(t.next_weekday())},
                              format="json").data["code"]
        res = cap_a.post(f"/api/v1/bookings/{code}/decline/", {"reason": "Family function"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        booking = Booking.objects.get(code=code)
        self.assertEqual((booking.status, booking.captain_id), ("requested", b.id))
        self.assertEqual(booking.service.agency_service_id, copy_a.agency_service_id)

        # Agency moves it back once Arjun is free again.
        detail = self.ag.get(f"/api/v1/agency/bookings/{code}/").data
        self.assertEqual([c["code"] for c in detail["candidates"]], [a.code])
        res = self.ag.post(f"/api/v1/agency/bookings/{code}/assign/", {"captain_id": str(a.id)}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Booking.objects.get(code=code).captain_id, a.id)

        # Nobody else free → the traveler gets a normal decline.
        res = self.ag.post(f"/api/v1/agency/bookings/{code}/decline/", {"reason": "Fully booked"}, format="json")
        self.assertEqual(Booking.objects.get(code=code).status, "declined")

    def test_leaving_needs_no_open_bookings_and_turns_agency_trips_off(self):
        self.register_and_approve()
        rohit = t.make_live_captain("Rohit")
        cap = self.join(rohit)
        trip = self.add_trip()
        copy = ServiceOffer.objects.get(captain=rohit, agency_service_id=trip["id"])
        self.trav.post("/api/v1/bookings/", {"service_id": str(copy.id), "guests": 1, "start_date": str(t.next_weekday())}, format="json")
        self.assertEqual(cap.post("/api/v1/captain/agency/leave/").status_code, 409)
        Booking.objects.update(status="declined")
        res = cap.post("/api/v1/captain/agency/leave/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNone(res.data["agency"])
        copy.refresh_from_db()
        rohit.refresh_from_db()
        self.assertFalse(copy.is_active)
        self.assertFalse(rohit.is_live)
        self.assertEqual(self.client.get(f"/api/v1/captains/?q={rohit.code}").data["count"], 0)

    def test_agency_on_hold_hides_its_captains(self):
        agency = self.register_and_approve()
        rohit = t.make_live_captain("Rohit")
        self.join(rohit)
        self.add_trip()
        self.assertEqual(self.client.get(f"/api/v1/captains/?q={rohit.code}").data["count"], 1)
        self.admin.post(f"/api/v1/admin/agencies/{agency.id}/hold/", {"hold": True, "reason": "KYC expired"}, format="json")
        self.assertEqual(self.client.get(f"/api/v1/captains/?q={rohit.code}").data["count"], 0)
        self.assertFalse(CaptainProfile.objects.get(pk=rohit.pk).is_bookable)

    def test_agency_cars_are_assigned_by_the_agency(self):
        self.register_and_approve()
        rohit = t.make_live_captain("Rohit")
        cap = self.join(rohit)
        res = self.ag.post("/api/v1/agency/vehicles/", {"kind": "suv", "make_model": "Toyota Innova", "registration_number": "TS09AB4821",
                                                        "capacity": 7, "captain_id": str(rohit.id)}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        mine = cap.get("/api/v1/captain/vehicles/").data
        self.assertTrue(mine[0]["agency_owned"])
        self.assertEqual(cap.patch(f"/api/v1/captain/vehicles/{mine[0]['id']}/", {"capacity": 2}, format="json").status_code, 404)
        self.assertEqual(cap.post("/api/v1/captain/vehicles/", {"kind": "car", "make_model": "Swift", "registration_number": "TS09AB0001"},
                                  format="json").status_code, 409)
        required = cap.get("/api/v1/captain/checklist/").data["required_documents"]
        self.assertIn("driving_licence", required)
        self.assertNotIn("vehicle_rc", required, "the agency's own car")

    def test_bad_invite_number_is_a_clear_error(self):
        self.register_and_approve()
        res = self.ag.post("/api/v1/agency/invites/", {"phone_number": "12"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "invalid_phone")
