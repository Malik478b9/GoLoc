from types import SimpleNamespace
from unittest import mock

from django.test import TestCase, override_settings

from apps.common import testing as t

URL = "/api/v1/ai/assist/"


def _reply(text):
    return SimpleNamespace(model="openai/gpt-oss-120b",
                           choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content=text))])


@override_settings(GROQ_API_KEY="gsk_test", ANTHROPIC_API_KEY="", AI_PROVIDER="")
class AssistTests(TestCase):
    def setUp(self):
        t.reset()
        self.captain = t.make_live_captain()
        self.cap = t.client_for(self.captain.user, "captain")
        self.trav = t.client_for(t.make_user("Ananya Reddy"), "traveler")

    def test_improves_a_field_with_context(self):
        with mock.patch("groq.Groq") as Groq:
            Groq.return_value.chat.completions.create.return_value = _reply(
                '{"text": "Old City food trails by a born-and-raised Hyderabadi", "alternatives": ["Taste Hyderabad like a local", "Old City food trails by a born-and-raised Hyderabadi"]}')
            res = self.cap.post(URL, {"purpose": "profile_tagline", "text": "i do food tours", "action": "improve",
                                      "context": {"city": "Hyderabad"}}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["text"], "Old City food trails by a born-and-raised Hyderabadi")
        self.assertEqual(res.data["alternatives"], ["Taste Hyderabad like a local"], "duplicates of the main answer dropped")
        prompt = Groq.return_value.chat.completions.create.call_args.kwargs["messages"][1]["content"]
        self.assertIn("i do food tours", prompt)
        self.assertIn("Hyderabad", prompt)

    def test_purposes_are_limited_to_their_app(self):
        res = self.trav.post(URL, {"purpose": "profile_bio", "text": "x"}, format="json")
        self.assertEqual(res.data["code"], "wrong_app")
        self.assertEqual(self.client.post(URL, {"purpose": "booking_note", "text": "x"}, format="json").status_code, 401)

    def test_empty_field_needs_write_or_instruction(self):
        res = self.cap.post(URL, {"purpose": "service_description", "text": "", "action": "shorten"}, format="json")
        self.assertEqual(res.data["code"], "nothing_to_edit")

    @override_settings(GROQ_API_KEY="")
    def test_status_and_disabled(self):
        self.assertEqual(self.client.get("/api/v1/ai/status/").json(), {"enabled": False})
        res = self.cap.post(URL, {"purpose": "profile_bio", "text": "hello"}, format="json")
        self.assertEqual(res.data["code"], "ai_disabled")

    def test_retries_when_groq_json_misses_the_schema(self):
        import groq
        import httpx

        bad = groq.BadRequestError(
            "json_validate_failed", response=httpx.Response(400, request=httpx.Request("POST", "https://api.groq.com")),
            body={"error": {"code": "json_validate_failed", "message": "missing properties"}})
        with mock.patch("groq.Groq") as Groq:
            Groq.return_value.chat.completions.create.side_effect = [bad, _reply('{"text": "Fixed", "alternatives": []}')]
            res = self.cap.post(URL, {"purpose": "profile_bio", "text": "helo i am guide"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["text"], "Fixed")
        self.assertEqual(Groq.return_value.chat.completions.create.call_count, 2)
