from types import SimpleNamespace
from unittest import mock

from django.test import TestCase, override_settings

from apps.bookings.tests.test_flow import MEDIA
from apps.common import testing as t
from apps.itineraries.models import Itinerary

# No AI keys: tests never call a real provider (the developer's .env may hold one).
SYNC = override_settings(ITINERARY_SYNC=True, ANTHROPIC_API_KEY="", GROQ_API_KEY="", AI_PROVIDER="")
URL = "/api/v1/captain/itineraries/"


@MEDIA
@SYNC
class ItineraryTests(TestCase):
    def setUp(self):
        t.reset()
        self.captain = t.make_live_captain("Leh Host", package=True)
        self.captain.weekly_slots.update(is_available=True)
        self.package = self.captain.services.get(kind="package")
        self.cap = t.client_for(self.captain.user, "captain")
        self.traveler = t.make_user("Ananya Reddy")
        self.trav = t.client_for(self.traveler, "traveler")

    def make_template(self, **extra):
        res = self.cap.post(URL, {
            "service_id": str(self.package.id), "tier": "lavish", "destination": "Leh · Nubra · Pangong",
            "arrival": {"mode": "flight", "point": "Leh airport (IXL)", "time": "10:30"},
            "inputs": {"hotels": ["The Grand Dragon Ladakh"], "must_include": ["Pangong Lake", "Nubra Valley"]}, **extra,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_default_itinerary_from_a_package_keeps_manual_inputs(self):
        data = self.make_template()
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["kind"], "template")
        self.assertEqual(data["days"], 6, "package length")
        self.assertEqual(data["title"], "Leh Explorer")
        days = data["content"]["days"]
        self.assertEqual(len(days), 6)
        self.assertEqual(days[0]["stay"]["hotel"], "The Grand Dragon Ladakh")
        self.assertTrue(days[0]["stay"]["confirmed"])
        self.assertEqual(data["poster"]["duration_label"], "6 Days · 5 Nights")
        self.assertIsNotNone(data["share_url"])

    def test_published_defaults_show_on_profile(self):
        data = self.make_template()
        public = f"/api/v1/captains/{self.captain.code}/itineraries/"
        self.assertEqual(self.client.get(public).json(), [])
        self.assertEqual(self.cap.post(f"{URL}{data['id']}/publish/", {"is_published": True}, format="json").status_code, 200)
        rows = self.client.get(public).json()
        self.assertEqual([r["code"] for r in rows], [data["code"]])
        self.assertEqual(self.client.get(f"/api/v1/captains/{self.captain.code}/").json()["itineraries"][0]["code"], data["code"])
        self.assertEqual(self.client.get(f"/api/v1/itineraries/{data['id']}/").status_code, 200)

    def test_custom_itinerary_for_a_booking(self):
        template = self.make_template()
        start = t.next_weekday(10)
        res = self.trav.post("/api/v1/bookings/", {"service_id": str(self.package.id), "guests": 2, "tier": "medium",
                                                   "start_date": str(start), "note": "Vegetarian, my mother has knee pain"},
                             format="json")
        self.assertEqual(res.status_code, 201, res.data)
        booking = res.data
        res = self.cap.post(URL, {"booking_id": booking["id"]}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        custom = res.data
        self.assertEqual((custom["kind"], custom["tier"], custom["guests"], custom["days"]), ("custom", "medium", 2, 6))
        self.assertEqual(custom["start_date"], str(start))
        self.assertEqual(custom["requests"], "Vegetarian, my mother has knee pain")
        self.assertEqual(custom["based_on_id"], template["id"])
        self.assertEqual(custom["inputs"]["hotels"], ["The Grand Dragon Ladakh"], "carried over from the default")

        detail = f"/api/v1/bookings/{booking['code']}/"
        self.assertIsNone(self.trav.get(detail).data["itinerary"], "not shared yet")
        self.assertEqual(self.cap.get(detail).data["itinerary"]["code"], custom["code"])
        self.cap.post(f"{URL}{custom['id']}/publish/", {"is_published": True}, format="json")
        self.assertEqual(self.trav.get(detail).data["itinerary"]["code"], custom["code"])
        self.assertEqual(self.trav.get(f"/api/v1/itineraries/{custom['id']}/").status_code, 200)
        stranger = t.client_for(t.make_user("Someone Else"), "traveler")
        self.assertEqual(stranger.get(f"/api/v1/itineraries/{custom['id']}/").status_code, 404)

    def test_hand_edits_and_ownership(self):
        data = self.make_template()
        content = data["content"]
        content["days"][0]["title"] = "Fly in, rest for altitude"
        res = self.cap.patch(f"{URL}{data['id']}/", {"content": content, "poster": {**data["poster"], "price_line": "From ₹48,000"}},
                             format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["edited_by_hand"])
        self.assertEqual(res.data["content"]["days"][0]["title"], "Fly in, rest for altitude")
        other = t.make_live_captain("Other Host")
        self.assertEqual(t.client_for(other.user, "captain").get(f"{URL}{data['id']}/").status_code, 404)
        self.assertEqual(self.trav.get(URL).status_code, 403)

    def test_pages_escape_content(self):
        data = self.make_template(title="<script>alert(1)</script> Leh")
        token = Itinerary.objects.get(pk=data["id"]).share_token
        page = self.client.get(f"/i/{token}/")
        self.assertEqual(page.status_code, 200)
        self.assertNotContains(page, "<script>alert(1)")
        self.assertContains(page, "&lt;script&gt;")
        self.assertContains(page, "Print / Save as PDF")
        self.assertEqual(self.client.get(f"/i/{token}/poster/").status_code, 200)


def _fake_message(text, stop_reason="end_turn"):
    return SimpleNamespace(stop_reason=stop_reason, model="claude-opus-5-5",
                           content=[SimpleNamespace(type="text", text=text)])


@MEDIA
@override_settings(ITINERARY_SYNC=True, ANTHROPIC_API_KEY="test-key", GROQ_API_KEY="", AI_PROVIDER="")
class ClaudeGenerationTests(TestCase):
    def setUp(self):
        t.reset()
        self.captain = t.make_live_captain("Leh Host", package=True)
        self.cap = t.client_for(self.captain.user, "captain")

    def _patch_stream(self, message):
        client = mock.MagicMock()
        stream = client.beta.messages.stream.return_value.__enter__.return_value
        stream.get_final_message.return_value = message
        return mock.patch("anthropic.Anthropic", return_value=client), client

    def test_calls_claude_with_schema_and_fallback(self):
        import json

        from apps.itineraries.ai import _template_draft

        it = Itinerary(captain=self.captain, title="Old City", destination="Hyderabad", tier="normal", days=1, guests=2)
        draft = _template_draft(it)
        patcher, client = self._patch_stream(_fake_message(json.dumps({"content": draft.content, "poster": draft.poster})))
        with patcher:
            res = self.cap.post(URL, {"title": "Old City", "destination": "Hyderabad", "tier": "normal", "days": 1,
                                      "requests": "Biryani please"}, format="json")
        self.assertEqual(res.data["status"], "ready", res.data)
        self.assertEqual(res.data["ai_model"], "claude-opus-5-5")
        kwargs = client.beta.messages.stream.call_args.kwargs
        self.assertEqual(kwargs["model"], "claude-opus-5-5")
        self.assertEqual(kwargs["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(kwargs["fallbacks"], "default")
        self.assertIn("Biryani please", kwargs["messages"][0]["content"])

    def test_refusal_marks_failed_with_a_reason(self):
        patcher, _ = self._patch_stream(_fake_message("", stop_reason="refusal"))
        with patcher:
            res = self.cap.post(URL, {"title": "Old City", "destination": "Hyderabad", "days": 1}, format="json")
        self.assertEqual(res.data["status"], "failed")
        self.assertIn("declined", res.data["error"])


def _groq_response(text, finish_reason="stop"):
    return SimpleNamespace(model="openai/gpt-oss-120b",
                           choices=[SimpleNamespace(finish_reason=finish_reason, message=SimpleNamespace(content=text))])


@MEDIA
@override_settings(ITINERARY_SYNC=True, ANTHROPIC_API_KEY="", GROQ_API_KEY="gsk_test", AI_PROVIDER="")
class GroqGenerationTests(TestCase):
    def setUp(self):
        t.reset()
        self.captain = t.make_live_captain("Leh Host", package=True)
        self.cap = t.client_for(self.captain.user, "captain")

    def _draft_json(self, days=1):
        import json

        from apps.itineraries.ai import _template_draft

        it = Itinerary(captain=self.captain, title="Old City", destination="Hyderabad", tier="normal", days=days, guests=2)
        draft = _template_draft(it)
        return draft, json.dumps({"content": draft.content, "poster": draft.poster})

    def test_groq_is_used_when_its_key_is_set(self):
        _, text = self._draft_json()
        with mock.patch("groq.Groq") as Groq:
            Groq.return_value.chat.completions.create.return_value = _groq_response(text)
            res = self.cap.post(URL, {"title": "Old City", "destination": "Hyderabad", "days": 1}, format="json")
        self.assertEqual(res.data["status"], "ready", res.data)
        self.assertEqual(res.data["ai_model"], "openai/gpt-oss-120b")
        kwargs = Groq.return_value.chat.completions.create.call_args.kwargs
        self.assertEqual(kwargs["response_format"]["type"], "json_schema")
        self.assertTrue(kwargs["response_format"]["json_schema"]["strict"])

    def test_truncated_answer_fails_cleanly(self):
        with mock.patch("groq.Groq") as Groq:
            Groq.return_value.chat.completions.create.return_value = _groq_response('{"content": {', "length")
            res = self.cap.post(URL, {"title": "Old City", "destination": "Hyderabad", "days": 1}, format="json")
        self.assertEqual(res.data["status"], "failed")
        self.assertIn("too long", res.data["error"])

    def test_rewrite_one_day_without_saving(self):
        import json

        draft, text = self._draft_json(days=2)
        with mock.patch("groq.Groq") as Groq:
            Groq.return_value.chat.completions.create.return_value = _groq_response(text)
            it = self.cap.post(URL, {"title": "Old City", "destination": "Hyderabad", "days": 2}, format="json").data
            new_day = {**draft.content["days"][1], "title": "Slow morning, Golconda at sunset"}
            Groq.return_value.chat.completions.create.return_value = _groq_response(json.dumps(new_day))
            res = self.cap.post(f"{URL}{it['id']}/days/2/rewrite/", {"instructions": "slower, end at Golconda"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["day"], res.data["title"]), (2, "Slow morning, Golconda at sunset"))
        prompt = Groq.return_value.chat.completions.create.call_args.kwargs["messages"][1]["content"]
        self.assertIn("slower, end at Golconda", prompt)
        self.assertNotEqual(Itinerary.objects.get(pk=it["id"]).content["days"][1]["title"], "Slow morning, Golconda at sunset")
