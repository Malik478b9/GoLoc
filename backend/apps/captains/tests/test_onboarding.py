from django.core.files.uploadedfile import SimpleUploadedFile

from apps.bookings.tests.test_flow import MEDIA
from apps.common import testing as t
from apps.social.models import Post
from django.test import TestCase


@MEDIA
class OnboardingTests(TestCase):
    def setUp(self):
        t.reset()
        self.user = t.make_user("Sana Mirza")
        self.cap = t.client_for(self.user, "captain")
        self.admin = t.client_for(t.make_user("Ops", staff=True), "admin")
        self.city = t.city("hyderabad")

    def test_captain_goes_from_signup_to_live(self):
        self.assertIsNone(self.cap.get("/api/v1/captain/profile/").data)
        self.assertEqual(self.cap.get("/api/v1/captain/checklist/").status_code, 409)

        res = self.cap.put("/api/v1/captain/profile/", {
            "full_name": "Sana Mirza", "city_id": str(self.city.id), "bio": "Photography walks", "tagline": "Blue hour",
            "languages": ["English", "Telugu"], "categories": ["photography", "culture"], "years_experience": 5}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["code"].startswith("CAP-"))
        bad = self.cap.put("/api/v1/captain/profile/", {"languages": ["Klingon"]}, format="json")
        self.assertEqual(bad.status_code, 400)

        self.assertEqual(self.cap.post("/api/v1/captain/profile/avatar/", {"avatar": t.png()}, format="multipart").status_code, 200)

        # Package tiers must rise Normal ≤ Medium ≤ Lavish
        res = self.cap.post("/api/v1/captain/services/", {"kind": "package", "title": "Leh", "category": "adventure",
                                                           "duration_days": 6, "normal_price": 50000, "medium_price": 40000,
                                                           "lavish_price": 90000}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.cap.post("/api/v1/captain/services/", {"kind": "experience", "title": "Charminar sunrise", "category": "photography",
                                                           "price": 1800, "duration_hours": 2, "stops": ["Charminar"]}, format="json")
        self.assertEqual(res.status_code, 201, res.data)

        res = self.cap.post("/api/v1/captain/vehicles/", {"kind": "car", "make_model": "Dzire", "registration_number": "ts 09 ab 4821",
                                                           "capacity": 4, "has_ac": True}, format="json")
        self.assertEqual(res.data["registration_number"], "TS09AB4821")
        check = self.cap.get("/api/v1/captain/checklist/").data
        self.assertEqual(check["required_documents"], ["id_proof", "driving_licence", "vehicle_rc"])
        self.assertFalse(check["can_submit"])
        self.assertEqual(self.cap.post("/api/v1/captain/submit/").status_code, 400)

        for doc in check["required_documents"]:
            res = self.cap.post("/api/v1/captain/documents/", {"doc_type": doc, "file": t.pdf()}, format="multipart")
            self.assertEqual(res.status_code, 201, res.data)
            self.assertNotIn("file", res.data, "KYC file URLs are never returned to apps")
        bad = self.cap.post("/api/v1/captain/documents/", {"doc_type": "id_proof",
                                                           "file": SimpleUploadedFile("x.exe", b"MZ")}, format="multipart")
        self.assertEqual(bad.status_code, 400)
        self.cap.put("/api/v1/captain/payout-account/", {"method": "upi", "account_holder": "Sana", "upi_id": "sana@okicici"}, format="json")

        self.assertTrue(self.cap.get("/api/v1/captain/checklist/").data["can_submit"])
        self.assertEqual(self.cap.post("/api/v1/captain/go-live/", {"is_live": True}, format="json").status_code, 409)
        self.assertEqual(self.cap.post("/api/v1/captain/submit/").data["review_status"], "pending")

        # Admin reviews documents (private download) and approves
        queue = self.admin.get("/api/v1/admin/captains/?status=pending").data["results"]
        self.assertEqual(len(queue), 1)
        detail = self.admin.get(f"/api/v1/admin/captains/{queue[0]['id']}/").data
        file_res = self.admin.get("/api/v1" + detail["documents"][0]["file_path"])
        self.assertEqual(file_res.status_code, 200)
        self.assertEqual(self.cap.get("/api/v1" + detail["documents"][0]["file_path"]).status_code, 403)
        res = self.admin.post(f"/api/v1/admin/captains/{queue[0]['id']}/review/", {"decision": "approve"}, format="json")
        self.assertEqual(res.data["review_status"], "approved")

        # Prime the cache while the Captain is offline, then go live: they must appear immediately.
        self.assertEqual(self.client.get("/api/v1/captains/?city=hyderabad&q=sana").data["count"], 0)
        self.assertEqual(self.cap.post("/api/v1/captain/go-live/", {"is_live": True}, format="json").data["is_live"], True)
        found = self.client.get("/api/v1/captains/?city=hyderabad&q=sana").data["results"]
        self.assertEqual(found[0]["name"], "Sana Mirza")
        self.assertEqual(self.cap.get("/api/v1/captain/dashboard/").status_code, 200)

    def test_reels_feed_like_and_moderation(self):
        captain = t.make_live_captain()
        cap = t.client_for(captain.user, "captain")
        video = SimpleUploadedFile("leh.mp4", b"\x00\x00\x00\x18ftypmp42", content_type="video/mp4")
        res = cap.post("/api/v1/social/mine/", {"kind": "reel", "media": video, "thumbnail": t.png(), "caption": "Pangong sunrise"},
                       format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        mismatch = cap.post("/api/v1/social/mine/", {"kind": "reel", "media": t.png()}, format="multipart")
        self.assertEqual(mismatch.status_code, 400)

        traveler = t.client_for(t.make_user("Ananya"), "traveler")
        feed = traveler.get("/api/v1/social/feed/?city=hyderabad").data
        self.assertEqual(len(feed["results"]), 1)
        post_id = feed["results"][0]["id"]
        self.assertEqual(feed["results"][0]["captain"]["code"], captain.code)
        self.assertEqual(traveler.post(f"/api/v1/social/posts/{post_id}/like/").data["like_count"], 1)
        self.assertEqual(traveler.post(f"/api/v1/social/posts/{post_id}/like/").data["like_count"], 1, "idempotent")
        self.assertTrue(traveler.get("/api/v1/social/feed/").data["results"][0]["liked"])
        for _ in range(3):
            traveler.post(f"/api/v1/social/posts/{post_id}/event/", {"type": "view"}, format="json")
        traveler.post(f"/api/v1/social/posts/{post_id}/event/", {"type": "profile_open"}, format="json")
        insights = cap.get("/api/v1/social/mine/insights/").data
        self.assertEqual((insights["views"], insights["profile_opens"], insights["likes"]), (1, 1, 1))

        self.admin.post(f"/api/v1/admin/posts/{post_id}/moderate/", {"hidden": True, "note": "Spam"}, format="json")
        self.assertEqual(Post.objects.get(pk=post_id).status, "hidden")
        self.assertEqual(len(traveler.get("/api/v1/social/feed/").data["results"]), 0)

    def test_build_my_trip_match(self):
        t.make_live_captain("Food Cap")
        t.make_live_captain("Leh Host", package=True)
        res = self.client.post("/api/v1/captains/match/", {"city": "hyderabad", "start_date": str(t.next_weekday()), "guests": 2,
                                                           "kind": "package", "tier": "lavish", "interests": ["adventure"]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(res.data["results"]), 1)
        top = res.data["results"][0]
        self.assertEqual(top["quote"]["fare"], 190000)
        self.assertTrue(top["available"])
        self.assertGreaterEqual(top["match"], 60)
