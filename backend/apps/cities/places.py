"""
Any place in India, for the traveler's "where are you" picker: states, districts,
mandals/taluks, cities, towns, villages, neighbourhoods and landmarks.

Backed by Photon (OpenStreetMap search, https://photon.komoot.io). Results are
cached, and only places inside India are returned. To move off the public
instance (fair-use only), point PLACES_PHOTON_URL at a self-hosted Photon.
"""
import hashlib
import logging

import requests
from django.conf import settings
from django.core.cache import cache

from apps.common.api import haversine_km

from .models import City

logger = logging.getLogger("goloc.places")

INDIA_BBOX = "68.1,6.5,97.4,35.7"  # lon_min, lat_min, lon_max, lat_max
USER_AGENT = "GoLoc/1.0 (travel marketplace; https://goloc.in)"
# Only things a traveler would call a place, never shops or bus stops.
OSM_TAGS = ["place", "boundary:administrative", "tourism:attraction", "tourism:viewpoint", "historic", "natural:peak",
            "natural:beach", "natural:waterfall", "natural:valley", "leisure:nature_reserve", "boundary:national_park"]
SKIP_VALUES = {"plot", "house", "farm", "allotments", "isolated_dwelling", "quarter", "city_block", "square"}

KIND = {
    "state": "State", "city": "City", "town": "Town", "village": "Village", "hamlet": "Village",
    "suburb": "Area", "neighbourhood": "Area", "locality": "Area", "borough": "Area", "island": "Island",
    "county": "District", "district": "District",
}


def _base() -> str:
    return getattr(settings, "PLACES_PHOTON_URL", "https://photon.komoot.io").rstrip("/")


def _kind(p: dict) -> str:
    key, value, typ = p.get("osm_key"), p.get("osm_value"), p.get("type")
    if key == "place":
        return KIND.get(value, "Place")
    if key == "boundary" and value == "administrative":
        name = (p.get("name") or "").lower()
        if typ == "state":
            return "State"
        if "mandal" in name or "taluk" in name or "tehsil" in name or "block" in name or "subdistrict" in name:
            return "Mandal / taluk"
        return "District" if typ in ("county", "district") else "Region"
    return "Place to visit"


def _shape(f: dict) -> dict | None:
    p = f.get("properties", {})
    if p.get("countrycode") != "IN" or not p.get("name"):
        return None
    if p.get("osm_value") in SKIP_VALUES:
        return None
    lng, lat = f["geometry"]["coordinates"][:2]
    kind = _kind(p)
    state = p.get("state") or ("" if kind == "State" else "")
    area = p.get("city") or p.get("county") or p.get("district") or ""
    if area == p["name"]:
        area = p.get("county") if p.get("county") != p["name"] else ""
    parts = [x for x in (area, state) if x and x != p["name"]]
    return {
        "id": f"{p.get('osm_type', '')}{p.get('osm_id', '')}",
        "name": p["name"],
        "kind": kind,
        "area": area or "",
        "state": state if kind != "State" else p["name"],
        "label": ", ".join(parts) if parts else "India",
        "lat": round(lat, 6),
        "lng": round(lng, 6),
    }


def _dedupe(rows: list[dict]) -> list[dict]:
    seen, out = set(), []
    for r in rows:
        k = (r["name"].lower(), r["state"].lower(), r["kind"])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def search(q: str, limit: int = 12) -> list[dict]:
    """Places in India matching `q` (typed as you go). [] when the service is unreachable."""
    q = " ".join(q.split())[:80]
    if len(q) < 2:
        return []
    ck = "places:q:" + hashlib.sha1(q.lower().encode()).hexdigest()
    hit = cache.get(ck)
    if hit is not None:
        return hit
    params = [("q", q), ("limit", 25), ("lang", "en"), ("bbox", INDIA_BBOX)] + [("osm_tag", t) for t in OSM_TAGS]
    try:
        r = requests.get(f"{_base()}/api/", params=params, headers={"User-Agent": USER_AGENT}, timeout=6)
        r.raise_for_status()
        rows = _dedupe([x for x in map(_shape, r.json().get("features", [])) if x])[:limit]
    except (requests.RequestException, ValueError, KeyError) as exc:
        logger.warning("Place search failed for %r: %s", q, exc)
        return []
    cache.set(ck, rows, 7 * 24 * 3600)
    return rows


def reverse(lat: float, lng: float) -> dict | None:
    """The named place at a point (for "use my location")."""
    ck = f"places:rev:{round(lat, 3)}:{round(lng, 3)}"
    hit = cache.get(ck)
    if hit is not None:
        return hit or None
    try:
        r = requests.get(f"{_base()}/reverse", params={"lat": lat, "lon": lng, "lang": "en", "limit": 5},
                         headers={"User-Agent": USER_AGENT}, timeout=6)
        r.raise_for_status()
        feats = r.json().get("features", [])
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Reverse geocode failed: %s", exc)
        return None
    feats = [f for f in feats if f.get("properties", {}).get("countrycode") == "IN"]
    if not feats:
        cache.set(ck, {}, 24 * 3600)
        return None
    # Prefer a named settlement (suburb, village, town) over a road, building or ward.
    props = [f["properties"] for f in feats]
    named = next((p for p in props if p.get("osm_key") == "place" and p.get("osm_value") not in SKIP_VALUES), None)
    p0 = props[0]
    name = (named or {}).get("name") or p0.get("locality") or p0.get("city") or p0.get("county") or p0.get("name")
    for suffix in (" Municipal Corporation", " Municipality", " Nagar Panchayat", " Cantonment Board"):
        if name and name.endswith(suffix):
            name = name[: -len(suffix)]
    state = p0.get("state", "")
    area = p0.get("city") or p0.get("county") or ""
    area = "" if area == name else area
    place = {"id": f"pt{round(lat, 4)},{round(lng, 4)}", "name": name, "kind": KIND.get((named or {}).get("osm_value"), "Area"),
             "area": area, "state": state, "label": ", ".join(x for x in (area, state) if x) or "India",
             "lat": round(lat, 6), "lng": round(lng, 6)}
    cache.set(ck, place or {}, 24 * 3600)
    return place


def nearest_live_city(lat: float, lng: float) -> tuple[City | None, float | None]:
    """The GoLoc city closest to a point, and how far it is (km)."""
    best, best_km = None, None
    for c in City.objects.filter(is_live=True).exclude(latitude=None).exclude(longitude=None):
        km = haversine_km(lat, lng, c.latitude, c.longitude)
        if best_km is None or km < best_km:
            best, best_km = c, km
    return best, best_km
