"""
The traveler home "Discover" feed: seasonal, distance-aware trip posters.

Ranking is deterministic (season fit × distance from the traveler's city).
AI only writes the copy (catchy titles, taglines, "why now"), once per month,
in the background; until it lands, the catalog's own copy is shown, so the
home screen never waits on the AI. Photos are real pictures of each place
from Wikimedia Commons, looked up once a week.
"""
import logging
import threading

import requests
from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections
from django.utils import timezone

from apps.cities.models import City
from apps.common import llm
from apps.common.api import haversine_km

from .catalog import MONTH_NAMES, MONTHS, SEASON_LABEL, SEASONS, SPOTS, VIBE_INTERESTS, VIBE_RAILS

logger = logging.getLogger("goloc.discover")

NEAR_KM = 700  # within a long drive or an overnight train: a weekend trip
WIKI_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "GoLoc/1.0 (travel marketplace; https://github.com/Malik478b9/GoLoc)"


# ---------------------------------------------------------------- season & distance
def season_fit(spot, month) -> float:
    if month in spot["best"]:
        return 1.0
    neighbours = {(month % 12) + 1, ((month - 2) % 12) + 1}
    return 0.5 if neighbours & set(spot["best"]) else 0.0


def months_label(best) -> str:
    """[10, 11, 12, 1, 2, 3] → 'Oct–Mar' (runs that wrap the year included)."""
    months = sorted(set(best))
    if len(months) == 12:
        return "All year"
    # Find the start of a run: a month whose previous month isn't in the set.
    starts = [m for m in months if ((m - 2) % 12) + 1 not in months]
    runs = []
    for s in starts:
        end = s
        while (end % 12) + 1 in months:
            end = (end % 12) + 1
        runs.append(MONTHS[s] if s == end else f"{MONTHS[s]}–{MONTHS[end]}")
    return ", ".join(runs)


def travel_hint(km: float | None) -> str:
    if km is None:
        return ""
    if km < 15:
        return "In your city"
    if km < 350:
        return f"{round(km)} km · ~{max(1, round(km / 55))} hr drive"
    if km < NEAR_KM:
        return f"{round(km)} km · overnight train or a long drive"
    return f"{round(km)} km · ~{max(1, round(km / 700 + 1))} hr flight"


# ---------------------------------------------------------------- photos
def images() -> dict:
    """wiki title → photo URL, from Wikipedia's page images. Cached for a week."""
    data = cache.get("discover:images")
    if data is not None:
        return data
    titles = sorted({s["wiki"] for s in SPOTS})
    try:
        r = requests.get(WIKI_API, params={"action": "query", "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": 960,
                                           "titles": "|".join(titles), "format": "json", "redirects": 1},
                         headers={"User-Agent": USER_AGENT}, timeout=5)
        r.raise_for_status()
        q = r.json().get("query", {})
    except (requests.RequestException, ValueError):
        logger.warning("Couldn't fetch place photos from Wikipedia")
        cache.set("discover:images", {}, 30 * 60)
        return {}
    # Map the titles we asked for through Wikipedia's normalisation and redirects.
    alias = {}
    for step in ("normalized", "redirects"):
        for row in q.get(step, []):
            alias[row["to"]] = alias.get(row["from"], row["from"])
    data = {}
    for page in q.get("pages", {}).values():
        src = (page.get("thumbnail") or {}).get("source")
        if src:
            asked = alias.get(page.get("title"), page.get("title"))
            data[asked] = src.split("?")[0]
    cache.set("discover:images", data, 7 * 24 * 3600)
    return data


# ---------------------------------------------------------------- AI copy
COPY_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "subhead": {"type": "string"},
        "spots": {"type": "array", "items": {
            "type": "object",
            "properties": {"key": {"type": "string"}, "title": {"type": "string"}, "tagline": {"type": "string"},
                           "why_now": {"type": "string"}},
            "required": ["key", "title", "tagline", "why_now"], "additionalProperties": False,
        }},
    },
    "required": ["headline", "subhead", "spots"],
    "additionalProperties": False,
}

COPY_SYSTEM = """You write the home screen of GoLoc, an Indian travel app where travelers book verified local hosts.
Write short, vivid, specific travel copy for the current month and season in India. No emojis, no hashtags, no exclamation marks, no clichés like "hidden gem" or "paradise".
- headline: at most 7 words, about where to go this month.
- subhead: one sentence, at most 16 words.
For each place:
- title: at most 6 words, catchy, about an experience there.
- tagline: at most 12 words, concrete details (what you see, eat, do).
- why_now: at most 12 words. Why this month is good, or honestly when it is better (for example the heat or the rains).
Use only facts you are sure of. Return every place key you were given exactly once."""


def _copy_key(month):
    return f"discover:copy:{timezone.localdate().year}:{month}"


def ai_copy(month) -> dict | None:
    """This month's AI copy if it's ready; otherwise start writing it and return None."""
    copy = cache.get(_copy_key(month))
    if copy is not None:
        return copy or None
    if not llm.enabled():
        return None
    # One writer at a time; the lock expires in case a worker dies mid-way.
    if cache.add(f"{_copy_key(month)}:lock", 1, 10 * 60):
        if settings.ITINERARY_SYNC:
            write_copy(month)
            return cache.get(_copy_key(month)) or None
        threading.Thread(target=_write_in_thread, args=(month,), daemon=True).start()
    return None


def _write_in_thread(month):
    try:
        write_copy(month)
    finally:
        close_old_connections()


def write_copy(month):
    season = SEASON_LABEL[SEASONS[month]]
    lines = [f"Month: {MONTH_NAMES[month]} ({season} in India).", "Places:"]
    for s in SPOTS:
        fit = season_fit(s, month)
        state = "at its best now" if fit == 1 else "shoulder season" if fit else "off season now"
        event = s.get("events", {}).get(month)
        lines.append(f"- key={s['key']}: {s['name']}, {s['city'].title()}. Vibes: {', '.join(s['vibes'])}. "
                     f"Best months: {months_label(s['best'])} ({state}).{' This month: ' + event + '.' if event else ''}")
    try:
        result = llm.complete_json(COPY_SYSTEM, "\n".join(lines), COPY_SCHEMA, name="discover_copy", effort="low", max_tokens=8000)
    except llm.LLMError as exc:
        logger.warning("Discover copy failed: %s", exc)
        cache.set(_copy_key(month), {}, 30 * 60)  # don't retry on every request
        return
    known = {s["key"] for s in SPOTS}
    spots = {row["key"]: row for row in result.data.get("spots", []) if row.get("key") in known}
    cache.set(_copy_key(month), {"headline": result.data.get("headline", ""), "subhead": result.data.get("subhead", ""),
                                 "spots": spots, "model": result.model}, 24 * 3600)


# ---------------------------------------------------------------- the feed
def feed(city_slug: str | None, today=None) -> dict:
    today = today or timezone.localdate()
    month = today.month
    season = SEASONS[month]
    cities = {c.slug: c for c in City.objects.filter(is_live=True)}
    origin = cities.get(city_slug or "")
    photos = images()
    copy = ai_copy(month) or {}
    ai_spots = copy.get("spots", {})

    posters = []
    for s in SPOTS:
        c = cities.get(s["city"])
        if not c:
            continue  # city not live: nothing to book there
        km = None
        if origin and None not in (origin.latitude, origin.longitude, c.latitude, c.longitude):
            km = 0.0 if origin.pk == c.pk else haversine_km(float(origin.latitude), float(origin.longitude),
                                                            float(c.latitude), float(c.longitude))
        fit = season_fit(s, month)
        ai = ai_spots.get(s["key"], {})
        interests = list(dict.fromkeys(VIBE_INTERESTS[v] for v in s["vibes"] if v in VIBE_INTERESTS))
        posters.append({
            "key": s["key"],
            "name": s["name"],
            "city_slug": c.slug,
            "city_name": c.name,
            "state": c.state,
            "title": ai.get("title") or s["title"],
            "tagline": ai.get("tagline") or s["tagline"],
            "why_now": ai.get("why_now") or (s.get("events", {}).get(month) or ("Best right now" if fit == 1 else "")),
            "vibes": s["vibes"],
            "best_months": months_label(s["best"]),
            "in_season": fit == 1,
            "season_fit": fit,
            "event": s.get("events", {}).get(month),
            "distance_km": round(km) if km is not None else None,
            "travel_hint": travel_hint(km),
            "image": photos.get(s["wiki"]),
            "image_credit": "Photo: Wikimedia Commons" if photos.get(s["wiki"]) else "",
            "build": {"city": c.slug, "spot": s["name"], "interests": interests,
                      "kind": "experience" if km is not None and km < 15 else "package"},
        })

    by_distance = lambda p: (p["distance_km"] if p["distance_km"] is not None else 99999)  # noqa: E731
    in_season = sorted([p for p in posters if p["in_season"]], key=lambda p: (not p["event"], by_distance(p)))
    rails = []

    def rail(key, title, subtitle, items, limit=10):
        seen, out = set(), []
        for p in items:
            if p["key"] not in seen:
                seen.add(p["key"])
                out.append(p)
        if out:
            rails.append({"key": key, "title": title, "subtitle": subtitle, "items": out[:limit]})

    month_name = MONTH_NAMES[month]
    rail("now", f"Best in {month_name}", f"{SEASON_LABEL[season]} picks, at their best right now", in_season)
    if origin:
        near_and_good = [p for p in posters if p["distance_km"] is not None and p["distance_km"] < NEAR_KM and p["season_fit"] >= 0.5]
        rail("near_season", f"Close to {origin.name} and in season", "Short trips that are good right now",
             sorted(near_and_good, key=lambda p: (-p["season_fit"], by_distance(p))))
        rail("local", f"In {origin.name}", "No travel needed: explore with a local", [p for p in posters if p["city_slug"] == origin.slug])
        rail("far", "Worth the journey", f"Further from {origin.name}, perfect this {SEASON_LABEL[season].lower()}",
             sorted([p for p in in_season if (p["distance_km"] or 0) >= NEAR_KM], key=by_distance))
    for vibe, title, subtitle in VIBE_RAILS:
        items = sorted([p for p in posters if vibe in p["vibes"]], key=lambda p: (-p["season_fit"], by_distance(p)))
        if len(items) >= 2:
            rail(f"vibe_{vibe}", title, subtitle, items)
    rail("later", "Save for later", "Better in another season: plan ahead", sorted([p for p in posters if p["season_fit"] == 0], key=by_distance))

    hero_spot = (in_season or posters or [None])[0]
    return {
        "season": {"key": season, "label": SEASON_LABEL[season], "month": month_name},
        "from_city": {"slug": origin.slug, "name": origin.name} if origin else None,
        "hero": {
            "headline": copy.get("headline") or f"Where to go in {month_name}",
            "subhead": copy.get("subhead") or f"{SEASON_LABEL[season]} picks from locals, near and far.",
            "poster": hero_spot,
        },
        "rails": rails,
        "ai": bool(copy),
    }
