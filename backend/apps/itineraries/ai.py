"""
Writes itineraries. With an AI provider configured (apps/common/llm.py), the
model drafts the document and poster as schema-checked JSON. Without one, a
plain template drafter fills the same shape so every screen still works; the
Captain then edits by hand.
"""
import json
import logging
from dataclasses import dataclass
from datetime import timedelta

from apps.common import llm

logger = logging.getLogger("goloc.itineraries")

_text = {"type": "string"}
_texts = {"type": "array", "items": _text}


def _obj(**props):
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_travel_leg = _obj(date_label=_text, mode=_text, point=_text, time=_text, pickup=_text, notes=_text)

SCHEMA = _obj(
    content=_obj(
        title=_text,
        summary=_text,
        highlights=_texts,
        arrival=_travel_leg,
        departure=_travel_leg,
        days={"type": "array", "items": _obj(
            day={"type": "integer"},
            date_label=_text,
            title=_text,
            base=_text,
            overview=_text,
            schedule={"type": "array", "items": _obj(
                time=_text,
                activity=_text,
                place=_text,
                type={"type": "string", "enum": ["travel", "sightseeing", "meal", "stay", "activity", "ticket", "free"]},
                details=_text,
                cost=_text,
            )},
            meals=_obj(breakfast=_text, lunch=_text, dinner=_text),
            stay=_obj(hotel=_text, area=_text, category=_text, confirmed={"type": "boolean"}, notes=_text),
            transport=_text,
            tickets={"type": "array", "items": _obj(item=_text, price=_text, notes=_text)},
            tips=_texts,
        )},
        inclusions=_texts,
        exclusions=_texts,
        cost_estimate={"type": "array", "items": _obj(item=_text, amount=_text)},
        packing_list=_texts,
        important_notes=_texts,
    ),
    poster=_obj(
        headline=_text,
        tagline=_text,
        duration_label=_text,
        highlights=_texts,
        tier_label=_text,
        price_line=_text,
        call_to_action=_text,
    ),
)

SYSTEM = """You are an experienced Indian local tour operator ("Captain") preparing trip itineraries on GoLoc, a marketplace connecting travelers with verified local hosts. You write the itinerary the Captain will hand to their traveler: practical, specific and honest.

How to write it:
- Plan day by day with realistic timings, travel durations between places, opening hours, altitude/acclimatisation or weather constraints where relevant, and rest time. Day 1 starts from the traveler's arrival; the last day ends at their departure.
- Match the comfort level:
  normal = guesthouses/homestays or budget hotels, local eateries, shared or basic private transport, standard tickets;
  medium = good 3-star hotels, mix of well-rated local restaurants, private AC cab, standard tickets with a few paid experiences;
  lavish = 4-5 star or boutique heritage stays, fine dining and curated meals, private SUV or premium transport, priority/VIP tickets and special experiences;
  standard = a single day experience or guide day with no stay.
- Name real, well-known places, attractions, eateries and hotels in that destination. Never invent a place. If unsure a specific hotel fits, name the area and category instead of a name.
- Hotel names the Captain supplied are used exactly and marked confirmed=true. Any hotel you suggest is confirmed=false so the Captain checks availability.
- Everything the Captain filled in by hand (must-include places, places to avoid, vehicle, meal preferences, notes) overrides your own ideas. The traveler's requests come next.
- Guide-only trips: the guide walks with the traveler in person and shows them where to go, what to see and how to get around. The traveler books their own stay and transport, so give stay and transport as suggestions and say the traveler arranges them.
- Costs are estimates in Indian rupees (₹), written like "₹1,200 per person". Tickets list entry fees and permits by name.
- Use "" for any field that doesn't apply (for example no breakfast on an arrival evening). Keep tips short and useful.
- The poster is one glance: a punchy headline, a short tagline, at most 5 highlights, a duration label like "5 Days · 4 Nights", the comfort level and a price line. No emojis."""


class GenerationError(Exception):
    pass


@dataclass
class Draft:
    content: dict
    poster: dict
    model: str


def _brief(it, instructions: str = "") -> str:
    """The request Claude sees: everything known about this trip, in plain words."""
    service = it.service
    lines = [
        f"Captain: {it.captain.name} ({it.captain.get_captain_type_display()}), based in {it.captain.city.name}.",
        f"Itinerary type: {'default itinerary for their trip listing' if it.kind == 'template' else 'custom itinerary for a booked traveler'}.",
        f"Title idea: {it.title}",
        f"Destination / places covered: {it.destination}",
        f"Comfort level: {it.tier}",
        f"Length: {it.days} day(s), {max(it.days - 1, 0)} night(s). Travelers: {it.guests}.",
    ]
    if it.start_date:
        lines.append(f"Arrival date: {it.start_date:%A %d %B %Y}. Departure date: {(it.end_date or it.start_date + timedelta(days=it.days - 1)):%A %d %B %Y}.")
    if it.arrival:
        lines.append("Arrival: " + json.dumps(it.arrival, ensure_ascii=False))
    if it.departure:
        lines.append("Departure: " + json.dumps(it.departure, ensure_ascii=False))
    if service:
        lines.append(f"Linked service: {service.title} ({service.get_kind_display()}). {service.description}".strip())
        if service.itinerary:
            lines.append("Captain's own day outline: " + " | ".join(service.itinerary))
        if service.stops:
            lines.append("Usual stops: " + ", ".join(service.stops))
        inclusions = (service.tier_inclusions or {}).get(it.tier)
        if inclusions:
            lines.append(f"What the {it.tier} tier includes: " + "; ".join(inclusions))
    if it.inputs:
        lines.append("Filled in by the Captain (keep exactly): " + json.dumps(it.inputs, ensure_ascii=False))
    if it.requests.strip():
        lines.append("Traveler's requests: " + it.requests.strip())
    if it.based_on_id and it.based_on.content:
        lines.append("Start from the Captain's default itinerary below and adapt it to the dates, comfort level and requests above:\n"
                     + json.dumps(it.based_on.content, ensure_ascii=False))
    if instructions.strip():
        lines.append("Current itinerary (the Captain may have edited it by hand; keep their edits):\n"
                     + json.dumps({"content": it.content, "poster": it.poster}, ensure_ascii=False))
        lines.append("Captain's instructions for this revision: " + instructions.strip())
    lines.append(f"Write exactly {it.days} day entries.")
    return "\n".join(lines)


def generate(it, instructions: str = "") -> Draft:
    if not llm.enabled():
        return _template_draft(it)
    try:
        # A detailed multi-day plan is long: give it room.
        result = llm.complete_json(SYSTEM, _brief(it, instructions), SCHEMA, name="itinerary", effort="medium", max_tokens=32000)
    except llm.LLMError as exc:
        raise GenerationError(str(exc)) from exc
    return Draft(content=result.data["content"], poster=result.data["poster"], model=result.model)


DAY_SCHEMA = SCHEMA["properties"]["content"]["properties"]["days"]["items"]


def rewrite_day(it, day: dict, instructions: str) -> dict:
    """One day, rewritten to the Captain's instructions. Not saved: the editor shows it first."""
    brief = "\n".join([
        _brief(it),
        "The whole itinerary as it stands:\n" + json.dumps(it.content, ensure_ascii=False),
        f"Rewrite only day {day.get('day')} below. Keep its day number and date; keep hotel names the Captain set unless told otherwise.",
        "Day to rewrite:\n" + json.dumps(day, ensure_ascii=False),
        "Captain's instructions: " + instructions.strip(),
    ])
    try:
        result = llm.complete_json(SYSTEM, brief, DAY_SCHEMA, name="itinerary_day", effort="low", max_tokens=8000)
    except llm.LLMError as exc:
        raise GenerationError(str(exc)) from exc
    return result.data


# ---------------------------------------------------------------- without an API key
TIER_STAY = {"normal": "Guesthouse / homestay", "medium": "3-star hotel", "lavish": "4–5 star / boutique stay", "standard": ""}
TIER_TRANSPORT = {"normal": "Shared or basic private transport", "medium": "Private AC cab",
                  "lavish": "Private SUV with chauffeur", "standard": "On foot / local transport with your guide"}


def _template_draft(it) -> Draft:
    """A fill-in-the-blanks plan in the same shape, built from what the Captain entered."""
    inputs = it.inputs or {}
    hotels = [h for h in inputs.get("hotels", []) if h]
    must = [p for p in inputs.get("must_include", []) if p]
    outline = list(it.service.itinerary) if it.service and it.service.itinerary else []
    guide_only = it.captain.captain_type == "guide" or (it.service and it.service.kind == "guide")
    days = []
    for n in range(1, it.days + 1):
        date = it.start_date + timedelta(days=n - 1) if it.start_date else None
        first, last = n == 1, n == it.days
        title = outline[n - 1] if n <= len(outline) else ("Arrival & settle in" if first else "Departure" if last and it.days > 1 else f"Explore {it.destination}")
        place = must[n - 1] if n - 1 < len(must) else it.destination
        hotel = hotels[min(n - 1, len(hotels) - 1)] if hotels else ""
        days.append({
            "day": n,
            "date_label": f"{date:%a %d %b}" if date else f"Day {n}",
            "title": title,
            "base": it.destination,
            "overview": "Add the plan for this day.",
            "schedule": [
                {"time": "09:00", "activity": "Meet your Captain", "place": it.arrival.get("point", "") if first else "Hotel lobby",
                 "type": "travel", "details": "", "cost": ""},
                {"time": "10:00", "activity": f"Visit {place}", "place": place, "type": "sightseeing", "details": "", "cost": ""},
                {"time": "13:00", "activity": "Lunch", "place": "", "type": "meal", "details": inputs.get("meals", ""), "cost": ""},
            ],
            "meals": {"breakfast": "" if first else "At the hotel", "lunch": "Local restaurant", "dinner": "" if last else "Local restaurant"},
            "stay": {"hotel": "" if last else hotel, "area": it.destination, "category": TIER_STAY.get(it.tier, ""),
                     "confirmed": bool(hotel), "notes": "Traveler books their own stay." if guide_only else ""},
            "transport": inputs.get("vehicle") or TIER_TRANSPORT.get(it.tier, ""),
            "tickets": [],
            "tips": [],
        })
    leg = lambda d: {"date_label": "", "mode": d.get("mode", ""), "point": d.get("point", ""), "time": d.get("time", ""),  # noqa: E731
                     "pickup": d.get("point", ""), "notes": ""}
    nights = max(it.days - 1, 0)
    return Draft(
        content={
            "title": it.title, "summary": f"{it.days}-day {it.tier} trip covering {it.destination}.",
            "highlights": must[:5], "arrival": leg(it.arrival or {}), "departure": leg(it.departure or {}), "days": days,
            "inclusions": list((it.service.tier_inclusions or {}).get(it.tier, [])) if it.service else [],
            "exclusions": [], "cost_estimate": [], "packing_list": [], "important_notes": [],
        },
        poster={
            "headline": it.title, "tagline": it.destination,
            "duration_label": f"{it.days} Day{'s' if it.days > 1 else ''}" + (f" · {nights} Night{'s' if nights > 1 else ''}" if nights else ""),
            "highlights": must[:5], "tier_label": it.get_tier_display(), "price_line": "", "call_to_action": "Book on GoLoc",
        },
        model="template",
    )
