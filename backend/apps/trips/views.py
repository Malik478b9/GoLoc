from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.html import escape
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import Booking
from apps.bookings.views import get_booking
from apps.cities.models import City
from apps.common.api import IsTravelerOrCaptain, role_of

from . import services
from .models import SOSAlert


class PointSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-180, max_value=180)
    accuracy = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=100000)
    heading = serializers.FloatField(required=False, allow_null=True)
    speed = serializers.FloatField(required=False, allow_null=True)


def _round_point(data):
    # Phones send 15 decimals; we store 6 (~10 cm).
    for k in ("lat", "lng"):
        if data.get(k) is not None:
            data[k] = round(float(data[k]), 6)
    return data


class LocationView(APIView):
    permission_classes = [IsTravelerOrCaptain]
    throttle_scope = "location"

    def post(self, request, ref):
        booking = get_booking(request, ref)
        s = PointSerializer(data=_round_point(dict(request.data)))
        s.is_valid(raise_exception=True)
        d = s.validated_data
        data = services.record_location(booking, request.user, role_of(request), d["lat"], d["lng"],
                                        d.get("accuracy"), d.get("heading"), d.get("speed"))
        return Response(data)


def live_payload(booking):
    snap = booking.service_snapshot
    return {
        "booking_id": booking.id, "code": booking.code, "status": booking.status, "title": snap.get("title"),
        "start_date": booking.start_date, "start_time": booking.start_time, "started_at": booking.started_at,
        "meeting_point": booking.meeting_point, "stops": snap.get("stops", []), "itinerary": snap.get("itinerary", []),
        "captain": {"name": booking.captain.name, "code": booking.captain.code},
        "captain_location": services.latest_location(booking, "captain"),
    }


class LiveView(APIView):
    """GET /trips/<ref>/live/ — polled every few seconds by both apps during a trip."""

    permission_classes = [IsTravelerOrCaptain]

    def get(self, request, ref):
        booking = get_booking(request, ref)
        services.ensure_protected(booking)
        city = booking.city
        data = live_payload(booking)
        data["traveler_location"] = services.latest_location(booking, "traveler")
        here = data["captain_location"] or data["traveler_location"]
        data["emergency"] = services.emergency_services(city, here["lat"] if here else city.latitude,
                                                        here["lng"] if here else city.longitude, limit=6)
        data["open_sos"] = list(booking.sos_alerts.filter(status__in=["open", "acknowledged"]).values("code", "status", "created_at"))
        return Response(data)


class SOSView(APIView):
    """POST /trips/<ref>/sos/ {lat?, lng?, message?}"""

    permission_classes = [IsTravelerOrCaptain]

    def post(self, request, ref):
        booking = get_booking(request, ref)
        lat = lng = None
        if request.data.get("lat") is not None:
            s = PointSerializer(data=_round_point({"lat": request.data.get("lat"), "lng": request.data.get("lng")}))
            s.is_valid(raise_exception=True)
            lat, lng = float(s.validated_data["lat"]), float(s.validated_data["lng"])
        alert = services.raise_sos(booking, request.user, role_of(request), lat, lng, str(request.data.get("message", "")))
        return Response({
            "code": alert.code, "status": alert.status,
            "emergency": services.emergency_services(booking.city, lat or booking.city.latitude, lng or booking.city.longitude),
            "message": "GoLoc safety team has been alerted. If you are in danger call 112 now.",
        }, status=201)


class EmergencyView(APIView):
    """GET /trips/emergency/?city=<slug>&lat=&lng= — public directory, works before any booking."""

    permission_classes = [AllowAny]

    def get(self, request):
        p = request.query_params
        city = City.objects.filter(slug=p.get("city", "")).first()
        try:
            lat, lng = float(p["lat"]), float(p["lng"])
        except (KeyError, ValueError):
            lat, lng = (city.latitude, city.longitude) if city else (None, None)
        return Response(services.emergency_services(city, lat, lng, limit=20))


class SharedTripView(APIView):
    """GET /trips/shared/<token>/ — what family sees from the shared link. Only while the trip is live."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        booking = get_object_or_404(Booking.objects.select_related("captain__user", "city"), share_token=token)
        if booking.status not in services.LIVE_STATUSES:
            raise Http404
        data = live_payload(booking)
        data["city"] = booking.city.name
        return Response(data)


SHARE_PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GoLoc · Live trip</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F6EFE1;color:#12211F}
#map{height:62vh}.p{padding:16px}h1{font-size:18px;margin:0 0 4px}.m{color:#8A7F6B;font-size:14px}</style></head>
<body><div id="map"></div><div class="p"><h1 id="t">Loading…</h1><div class="m" id="s"></div>
<p class="m">Shared from GoLoc. Emergency? Call <b>112</b>.</p></div>
<script>const URL_=%s;const map=L.map('map').setView([%s,%s],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);let mk=null;
async function tick(){const r=await fetch(URL_);if(!r.ok){document.getElementById('t').textContent='This trip is no longer live.';return;}
const d=await r.json();document.getElementById('t').textContent=d.title+' · '+d.code;
document.getElementById('s').textContent='Captain '+d.captain.name+' · '+d.status.replace('_',' ')+(d.captain_location?' · updated '+new Date(d.captain_location.at).toLocaleTimeString():'');
if(d.captain_location){const ll=[d.captain_location.lat,d.captain_location.lng];if(!mk){mk=L.marker(ll).addTo(map);map.setView(ll,15)}else mk.setLatLng(ll)}
setTimeout(tick,10000)}tick();</script></body></html>"""


def share_page(request, token):
    booking = Booking.objects.filter(share_token=token).select_related("city").first()
    if not booking:
        raise Http404
    import json

    api = f"/api/v1/trips/shared/{escape(token)}/"
    return HttpResponse(SHARE_PAGE % (json.dumps(api), booking.city.latitude or 20.59, booking.city.longitude or 78.96))


class MySOSView(APIView):
    """GET /trips/<ref>/sos/ — alerts on this booking (to show status in-app)."""

    permission_classes = [IsTravelerOrCaptain]

    def get(self, request, ref):
        booking = get_booking(request, ref)
        return Response(list(SOSAlert.objects.filter(booking=booking).values("code", "status", "created_at", "notes")))
