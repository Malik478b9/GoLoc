from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.cities import places

PHOTON = {
    "features": [
        {"geometry": {"coordinates": [82.880583, 18.323442]},
         "properties": {"osm_type": "N", "osm_id": 1, "osm_key": "place", "osm_value": "town", "type": "city", "name": "Araku Valley",
                        "county": "Araku Valley Mandal", "state": "Andhra Pradesh", "countrycode": "IN"}},
        {"geometry": {"coordinates": [74.0, 31.0]},  # outside India: dropped
         "properties": {"osm_type": "N", "osm_id": 2, "osm_key": "place", "osm_value": "village", "name": "Araku", "countrycode": "PK"}},
        {"geometry": {"coordinates": [82.9, 18.3]},  # a building, not a place: dropped
         "properties": {"osm_type": "N", "osm_id": 3, "osm_key": "place", "osm_value": "house", "name": "Araku House", "countrycode": "IN"}},
    ]
}


class PlaceSearchTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create(phone_number="+919811100001", full_name="T")
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    @mock.patch("apps.cities.places.requests.get")
    def test_search_returns_only_places_in_india(self, get):
        get.return_value = mock.Mock(status_code=200, json=lambda: PHOTON, raise_for_status=lambda: None)
        res = self.api.get("/api/v1/cities/places/", {"q": "araku"})
        self.assertEqual(res.status_code, 200)
        rows = res.json()
        self.assertEqual([r["name"] for r in rows], ["Araku Valley"])
        self.assertEqual(rows[0]["kind"], "Town")
        self.assertEqual(rows[0]["label"], "Araku Valley Mandal, Andhra Pradesh")

    @mock.patch("apps.cities.places.requests.get", side_effect=places.requests.ConnectionError("down"))
    def test_search_down_returns_empty_list(self, _get):
        self.assertEqual(self.api.get("/api/v1/cities/places/", {"q": "araku"}).json(), [])

    def test_setting_a_place_moves_city_to_nearest_live_one(self):
        res = self.api.patch("/api/v1/auth/me/", {"set_place": {"name": "Araku Valley", "kind": "Town", "state": "Andhra Pradesh",
                                                                 "lat": 18.3234, "lng": 82.8806}}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["place"]["name"], "Araku Valley")
        self.assertEqual(body["city"]["slug"], "hyderabad")  # nearest seeded live city
        self.assertGreater(body["place"]["nearest_city_km"], 300)

        # Choosing a GoLoc city directly replaces the custom place.
        jaipur = self.api.get("/api/v1/cities/").json()[0]
        body = self.api.patch("/api/v1/auth/me/", {"city_id": jaipur["id"]}, format="json").json()
        self.assertEqual(body["place"]["name"], "Jaipur")

    def test_place_outside_india_is_rejected(self):
        res = self.api.patch("/api/v1/auth/me/", {"set_place": {"name": "London", "lat": 51.5, "lng": -0.12}}, format="json")
        self.assertEqual(res.status_code, 400)
