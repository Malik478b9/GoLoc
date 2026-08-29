import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from apps.bookings.models import Booking
from .models import LiveTripPing, SOSAlert


class TripTrackingConsumer(AsyncWebsocketConsumer):
    """
    ws://.../ws/trip/<booking_id>/
    Two message types over one socket:
      {"type": "location_ping", "lat": .., "lng": ..}   -> Live Trip screen
      {"type": "sos", "lat": .., "lng": ..}              -> Safety & SOS
    Broadcasts to an Admin-monitored group in addition to the two
    participants, so Admin's 'Command Center' (Section 2.3) sees SOS
    events immediately.
    """

    async def connect(self):
        self.booking_id = self.scope["url_route"]["kwargs"]["booking_id"]
        self.group_name = f"trip_{self.booking_id}"

        booking = await self._get_booking()
        if booking is None or not booking.sos_active:
            # BR-5: pay-to-protect — refuse the connection if payment hasn't unlocked SOS.
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add("admin_ops_alerts", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.channel_layer.group_discard("admin_ops_alerts", self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get("type")

        if msg_type == "location_ping":
            await self._save_ping(data["lat"], data["lng"])
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "trip.update", "lat": data["lat"], "lng": data["lng"]},
            )
        elif msg_type == "sos":
            alert = await self._create_sos(data.get("lat"), data.get("lng"))
            await self.channel_layer.group_send(
                "admin_ops_alerts",
                {
                    "type": "sos.raised",
                    "booking_id": str(self.booking_id),
                    "alert_id": str(alert.id),
                    "lat": data.get("lat"),
                    "lng": data.get("lng"),
                },
            )

    async def trip_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def sos_raised(self, event):
        await self.send(text_data=json.dumps(event))

    @database_sync_to_async
    def _get_booking(self):
        return Booking.objects.filter(pk=self.booking_id).select_related("captain").first()

    @database_sync_to_async
    def _save_ping(self, lat, lng):
        return LiveTripPing.objects.create(booking_id=self.booking_id, latitude=lat, longitude=lng)

    @database_sync_to_async
    def _create_sos(self, lat, lng):
        return SOSAlert.objects.create(
            booking_id=self.booking_id,
            raised_by=self.scope["user"],
            latitude=lat,
            longitude=lng,
        )
