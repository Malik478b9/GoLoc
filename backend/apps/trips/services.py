from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

from apps.bookings.models import Booking
from apps.bookings.services import log
from apps.common.api import conflict, haversine_km
from apps.common.models import next_public_code
from apps.notifications.service import notify, notify_admins

from .models import EmergencyService, LocationPing, SOSAlert

LIVE_STATUSES = (Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS)


def _key(booking_id, role):
    return f"loc:{booking_id}:{role}"


def ensure_protected(booking):
    """BR-5: live trip and SOS unlock only after in-app payment."""
    if booking.status not in LIVE_STATUSES:
        raise conflict("Live tracking and SOS turn on once the trip is paid and confirmed.", "not_protected")


def record_location(booking, user, role, lat, lng, accuracy=None, heading=None, speed=None):
    ensure_protected(booking)
    if booking.status == Booking.Status.CONFIRMED and timezone.localdate() < booking.start_date:
        raise conflict("Location sharing starts on the trip day.", "too_early")
    ping = LocationPing.objects.create(booking=booking, user=user, role=role, lat=lat, lng=lng,
                                       accuracy_m=accuracy, heading=heading, speed_mps=speed)
    data = {"lat": float(lat), "lng": float(lng), "accuracy_m": accuracy, "heading": heading, "at": ping.created_at.isoformat()}
    cache.set(_key(booking.pk, role), data, 6 * 3600)
    return data


def latest_location(booking, role):
    data = cache.get(_key(booking.pk, role))
    if data is None:
        ping = LocationPing.objects.filter(booking=booking, role=role).order_by("-created_at").first()
        if ping:
            data = {"lat": float(ping.lat), "lng": float(ping.lng), "accuracy_m": ping.accuracy_m, "heading": ping.heading,
                    "at": ping.created_at.isoformat()}
            cache.set(_key(booking.pk, role), data, 6 * 3600)
    return data


def emergency_services(city=None, lat=None, lng=None, limit=12):
    qs = EmergencyService.objects.filter(Q(city__isnull=True) | Q(city=city)) if city else EmergencyService.objects.filter(city__isnull=True)
    rows = []
    for s in qs:
        dist = round(haversine_km(lat, lng, s.lat, s.lng), 1) if lat is not None and s.lat is not None else None
        rows.append({"kind": s.kind, "name": s.name, "phone": s.phone, "address": s.address,
                     "lat": s.lat, "lng": s.lng, "distance_km": dist, "national": s.city_id is None})
    rows.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"] or 0, r["national"]))
    return rows[:limit]


def raise_sos(booking, user, role, lat=None, lng=None, message="") -> SOSAlert:
    ensure_protected(booking)
    if lat is None:
        last = latest_location(booking, role)
        if last:
            lat, lng = last["lat"], last["lng"]
    alert = SOSAlert.objects.create(code=next_public_code("SOS"), booking=booking, raised_by=user, role=role,
                                    lat=lat, lng=lng, message=message[:500])
    log(booking, user, role, "sos", f"SOS raised ({alert.code})")
    where = f"{lat:.5f},{lng:.5f}" if lat is not None else "location unknown"
    notify_admins("sos_raised", f"🚨 SOS {alert.code} · {booking.code}",
                  f"{role.title()} {user.full_name or user.phone_number} · {where} · {message[:80]}",
                  {"sos_id": alert.id, "booking_id": booking.id})
    other = (booking.captain.user, "captain") if role == "traveler" else (booking.traveler, "traveler")
    notify(other[0], other[1], "sos_raised", "🚨 SOS raised on your trip",
           "GoLoc safety team has been alerted and will call shortly.", {"booking_id": booking.id})
    return alert
