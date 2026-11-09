"""Captains in their own language: voice briefs, itinerary translations, app language."""
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.bookings.tests.test_flow import MEDIA
from apps.common import llm
from apps.common import testing as t

SYNC = override_settings(ITINERARY_SYNC=True, ANTHROPIC_API_KEY="", GROQ_API_KEY="", AI_PROVIDER="")
URL = "/api/v1/captain/itineraries/"


@MEDIA
@SYNC
class CaptainLanguageTests(TestCase):
    def setUp(self):
        t.reset()
        self.captain = t.make_live_captain("Leh Host", package=True)
        self.package = self.captain.services.get(kind="package")
        self.cap = t.client_for(self.captain.user, "captain")

    def make(self):
        res = self.cap.post(URL, {"service_id": str(self.package.id), "inputs": {"brief": "మొదటి రోజు లేహ్ ఎయిర్‌పోర్ట్ పికప్"}}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_brief_in_any_language_is_kept_and_sent_to_the_ai(self):
        data = self.make()
        self.assertEqual(data["inputs"]["brief"], "మొదటి రోజు లేహ్ ఎయిర్‌పోర్ట్ పికప్")
        from apps.itineraries.ai import _brief
        from apps.itineraries.models import Itinerary

        prompt = _brief(Itinerary.objects.get(pk=data["id"]))
        self.assertIn("in their own words", prompt)
        self.assertIn("లేహ్", prompt)

    def test_language_is_saved_on_the_account(self):
        res = self.cap.patch("/api/v1/auth/me/", {"language": "te"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["language"], "te")
        self.assertEqual(self.cap.patch("/api/v1/auth/me/", {"language": "xx"}, format="json").status_code, 400)

    def test_translation_is_made_once_and_reused_until_the_english_changes(self):
        data = self.make()
        fake = {"content": {**data["content"], "title": "లేహ్ ట్రిప్"}, "poster": data["poster"]}
        with override_settings(GROQ_API_KEY="k"), mock.patch.object(llm, "complete_json", return_value=llm.Result(fake, "m")) as call:
            first = self.cap.get(f"{URL}{data['id']}/translated/", {"lang": "te"})
            again = self.cap.get(f"{URL}{data['id']}/translated/", {"lang": "te"})
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.json()["content"]["title"], "లేహ్ ట్రిప్")
        self.assertEqual(again.json()["content"]["title"], "లేహ్ ట్రిప్")
        self.assertEqual(call.call_count, 1, "second read comes from the saved copy")
        # English is returned as is, without the AI.
        en = self.cap.get(f"{URL}{data['id']}/translated/", {"lang": "en"})
        self.assertEqual(en.json()["content"]["title"], data["content"]["title"])

    def test_transcribe(self):
        audio = SimpleUploadedFile("voice.m4a", b"\x00" * 100, content_type="audio/m4a")
        self.assertEqual(self.cap.post("/api/v1/ai/transcribe/", {}, format="multipart").status_code, 400)
        with override_settings(GROQ_API_KEY="k"), mock.patch("apps.assist.speech.requests.post") as post:
            post.return_value = mock.Mock(status_code=200, json=lambda: {"text": "హవా మహల్ చూపిస్తాను"})
            res = self.cap.post("/api/v1/ai/transcribe/", {"audio": audio, "language": "te"}, format="multipart")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.json()["text"], "హవా మహల్ చూపిస్తాను")
        self.assertEqual(post.call_args.kwargs["data"]["language"], "te")
