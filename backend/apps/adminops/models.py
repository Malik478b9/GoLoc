from django.conf import settings
from django.db import models


class AdminAction(models.Model):
    """Who did what in the admin console. Append-only."""

    id = models.BigAutoField(primary_key=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="admin_actions")
    action = models.CharField(max_length=40)
    target_type = models.CharField(max_length=20)
    target_id = models.CharField(max_length=40)
    target_label = models.CharField(max_length=80, blank=True)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["target_type", "target_id"]), models.Index(fields=["-created_at"])]


def audit(actor, action, target, label="", **data):
    AdminAction.objects.create(
        actor=actor, action=action, target_type=target.__class__.__name__.lower(), target_id=str(target.pk),
        target_label=(label or getattr(target, "code", "") or str(target))[:80], data=data,
    )
