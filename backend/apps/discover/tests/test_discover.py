from datetime import date
from types import SimpleNamespace
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

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

    def test_feed_ranks_by_season_and_distance(self):
        d = service.feed("hyderabad", today=date(2026, 10, 28))
        self.assertEqual(d["season"], {"key": "autumn", "label": "Autumn", "month": "October"})
        self.assertFalse(d["ai"])
        rails = {r["key"]: r for r in d["rails"]}
        now = [p["key"] for p in rails["now"]["items"]]
        self.assertIn("charminar", now)
        self.assertNotIn("solang", now, "Solang is a winter/summer place")
        self.assertEqual({p["city_slug"] for p in rails["local"]["items"]}, {"hyderabad"})
        self.assertTrue(all(p["distance_km"] < service.NEAR_KM for p in rails["near_season"]["items"]))
        self.assertTrue(all(p["distance_km"] >= service.NEAR_KM for p in rails["far"]["items"]))
        charminar = next(p for p in rails["local"]["items"] if p["key"] == "charminar")
        self.assertEqual(charminar["image"], "https://upload.example/charminar.jpg")
        self.assertEqual(charminar["travel_hint"], "In your city")
        self.assertEqual(charminar["build"], {"city": "hyderabad", "spot": "Charminar", "interests": ["food", "heritage", "nightlife"],
                                              "kind": "experience"})
        amer = next(p for p in d["rails"][0]["items"] + rails["far"]["items"] if p["key"] == "amer_fort")
        self.assertEqual(amer["image"], "https://upload.example/amer.jpg", "redirected title mapped back")

    def test_events_surface_in_their_month(self):
        d = service.feed("varanasi", today=date(2026, 11, 10))
        ghat = next(p for p in d["rails"][0]["items"] if p["key"] == "dashashwamedh")
        self.assertEqual(ghat["event"], "Dev Deepawali lights up every ghat")
        self.assertEqual(d["rails"][0]["items"][0]["key"], "dashashwamedh", "events lead the in-season rail")

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
        self.assertEqual(d["hero"]["headline"], "Go north this October")
        charminar = next(p for r in d["rails"] for p in r["items"] if p["key"] == "charminar")
        self.assertEqual((charminar["title"], charminar["why_now"]), ("Chai by the Charminar", "Cool evenings"))

    def test_endpoint_is_public(self):
        res = self.client.get("/api/v1/discover/?city=goa")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["from_city"]["name"], "Goa")
