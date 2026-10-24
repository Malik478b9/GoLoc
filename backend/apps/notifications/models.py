from django.conf import settings
from django.db import models


class Device(models.Model):
    """An installed app that can receive push. Keyed by the Expo push token."""

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    role = models.CharField(max_length=10)
    expo_token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=10, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["user", "role", "is_active"])]


class Notification(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    role = models.CharField(max_length=10, help_text="Which app shows it.")
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=300)
    data = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "role", "-created_at"]), models.Index(fields=["user", "role", "read_at"])]
