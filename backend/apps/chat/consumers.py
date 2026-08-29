import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import Conversation, Message


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws://.../ws/chat/<booking_id>/
    Backs the Traveler and Captain 'Messages' screens (Section 3.1 / 4.1).
    Group name is scoped to the booking so only its two participants
    (enforced by _get_conversation) share a channel.
    """

    async def connect(self):
        self.booking_id = self.scope["url_route"]["kwargs"]["booking_id"]
        self.group_name = f"chat_{self.booking_id}"

        conversation = await self._get_conversation()
        if conversation is None or not await self._user_is_participant(conversation):
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        body = data.get("message", "").strip()
        if not body:
            return

        message = await self._save_message(body)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat.message",
                "message": body,
                "sender_id": str(self.scope["user"].id),
                "sent_at": message.sent_at.isoformat(),
            },
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))

    @database_sync_to_async
    def _get_conversation(self):
        return Conversation.objects.filter(booking_id=self.booking_id).select_related("booking").first()

    @database_sync_to_async
    def _user_is_participant(self, conversation):
        user = self.scope["user"]
        booking = conversation.booking
        return user.id == booking.traveler_id or user.id == booking.captain.user_id

    @database_sync_to_async
    def _save_message(self, body):
        conversation = Conversation.objects.get(booking_id=self.booking_id)
        return Message.objects.create(
            conversation=conversation, sender=self.scope["user"], body=body
        )
