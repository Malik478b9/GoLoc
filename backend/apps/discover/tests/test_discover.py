from datetime import date
from types import SimpleNamespace
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from apps.common import testing as t
from apps.discover import service

WIKI = {"query": {"normalized": [{"from": "City_Palace,_Udaipur", "to": "City Palace, Udaipur"}],
                  "redirects": [{"from": "Amer Fort", "to": "Amber Fort"}],
                  "pages": {"1": {"title": "Charminar", "thumbnail": {"source": "https://upload.example/charminar.jpg?x=1"}},
                            "2": {"title": "Amber Fort", "thumbnail": {"source": "https://upload.example/amer.jpg"}}}}}


@override_settings(GROQ_API_KEY="", ANTHROPIC_API_KEY="", AI_PROVIDER="", ITINERARY_SYNC=True)
class DiscoverTests(TestCase):
    def setUp(self):
        cache.clear()
        self.wiki = mock.patch("apps.discover.service.requests.get",
                               return_value=SimpleNamespace(raise_for_status=lambda: None, json=lambda: WIKI))
        self.wiki.start()
        self.addCleanup(self.wiki.stop)

    def test_months_label_wraps_the_year(self):
        self.assertEqual(service.months_label([10, 11, 12, 1, 2, 3]), "Oct–Mar")
        self.assertEqual(service.months_label([2, 3, 4, 5, 9, 10, 11]), "Feb–May, Sep–Nov")

    def test_seven_picks_by_season_then_distance(self):
        d = service.feed("hyderabad", today=date(2026, 10, 28))
        self.assertEqual(d["season"], {"key": "autumn", "label": "Autumn", "month": "October"})
        self.assertFalse(d["ai"])
        picks = d["picks"]
        self.assertEqual(len(picks), 7)
        keys = [p["key"] for p in picks]
        self.assertEqual(keys[:2], ["charminar", "golconda"], "in season and in your city first")
        self.assertNotIn("solang", keys, "Solang is a winter/summer place")
        self.assertTrue(all(sum(p["city_slug"] == c for p in picks) <= 2 for c in {p["city_slug"] for p in picks}))
        charminar = picks[0]
        self.assertEqual(charminar["image"], "https://upload.example/charminar.jpg")
        self.assertEqual(charminar["travel_hint"], "In your city")
        self.assertEqual(charminar["build"], {"city": "hyderabad", "spot": "Charminar", "interests": ["food", "heritage", "nightlife"],
                                              "kind": "experience"})
        amer = next(p for p in service.posters("hyderabad", today=date(2026, 10, 28))[0] if p["key"] == "amer_fort")
        self.assertEqual(amer["image"], "https://upload.example/amer.jpg", "redirected title mapped back")

    def test_events_lift_a_place(self):
        d = service.feed("hyderabad", today=date(2026, 11, 10))
        self.assertIn("dashashwamedh", [p["key"] for p in d["picks"]], "Dev Deepawali in November")

    @override_settings(GROQ_API_KEY="gsk_test")
    def test_ai_copy_is_used_once_written(self):
        reply = '{"headline": "Go north this October", "subhead": "Cool air everywhere.", "spots": [' \
                '{"key": "charminar", "title": "Chai by the Charminar", "tagline": "Lanes after dark", "why_now": "Cool evenings"},' \
                '{"key": "not_a_spot", "title": "x", "tagline": "x", "why_now": "x"}]}'
        with mock.patch("groq.Groq") as Groq:
            Groq.return_value.chat.completions.create.return_value = SimpleNamespace(
                model="openai/gpt-oss-120b", choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content=reply))])
            d = service.feed("hyderabad", today=date(2026, 10, 28))
            service.feed("hyderabad", today=date(2026, 10, 28))
            self.assertEqual(Groq.return_value.chat.completions.create.call_count, 1, "copy is cached for the month")
        self.assertTrue(d["ai"])
        self.assertEqual(d["headline"], "Go north this October")
        self.assertEqual((d["picks"][0]["title"], d["picks"][0]["why_now"]), ("Chai by the Charminar", "Cool evenings"))

    def test_save_for_later(self):
        t.reset()
        trav = t.client_for(t.make_user("Ananya Reddy"), "traveler")
        self.assertEqual(trav.post("/api/v1/discover/saved/charminar/").json(), {"saved": True})
        self.assertEqual(trav.post("/api/v1/discover/saved/nowhere/").status_code, 400)
        feed = trav.get("/api/v1/discover/?city=hyderabad").json()
        self.assertTrue(next(p for p in feed["picks"] if p["key"] == "charminar")["saved"])
        self.assertEqual([p["key"] for p in trav.get("/api/v1/discover/saved/?city=goa").json()], ["charminar"])
        trav.delete("/api/v1/discover/saved/charminar/")
        self.assertEqual(trav.get("/api/v1/discover/saved/").json(), [])
        self.assertEqual(self.client.post("/api/v1/discover/saved/charminar/").status_code, 401)

    def test_endpoint_is_public(self):
        res = self.client.get("/api/v1/discover/?city=goa")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["from_city"]["name"], "Goa")
