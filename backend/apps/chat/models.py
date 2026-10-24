import uuid

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """One thread per traveler ↔ Captain pair, reused across bookings."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    traveler = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversations")
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="conversations")
    booking = models.ForeignKey("bookings.Booking", null=True, blank=True, on_delete=models.SET_NULL,
                                help_text="Most recent booking discussed.")
    last_message_at = models.DateTimeField(null=True, blank=True)
    last_message_preview = models.CharField(max_length=120, blank=True)
    traveler_unread = models.PositiveIntegerField(default=0)
    captain_unread = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-last_message_at"]
        constraints = [models.UniqueConstraint(fields=["traveler", "captain"], name="unique_conversation_pair")]
        indexes = [models.Index(fields=["traveler", "-last_message_at"]), models.Index(fields=["captain", "-last_message_at"])]


class Message(models.Model):
    id = models.BigAutoField(primary_key=True)  # monotonic → clients poll with ?after=<id>
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    sender_role = models.CharField(max_length=10)
    body = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["conversation", "id"])]
