from django.apps import AppConfig


class CaptainsConfig(AppConfig):
    name = "apps.captains"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import signals  # noqa: F401 — registers the discovery cache invalidation
