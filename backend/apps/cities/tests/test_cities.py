from django.test import TestCase
from rest_framework.test import APIClient

from apps.cities.models import City


class CityListTests(TestCase):
    def test_lists_only_live_cities_without_login(self):
        City.objects.create(name="Leh", slug="leh", is_live=False)
        res = APIClient().get("/api/v1/cities/")
        self.assertEqual(res.status_code, 200)
        names = [c["name"] for c in res.json()]
        self.assertIn("Jaipur", names)          # seeded pilot city
        self.assertNotIn("Leh", names)
        self.assertEqual(names[0], "Jaipur")    # sort_order respected
