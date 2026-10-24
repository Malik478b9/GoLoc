from datetime import timedelta

from celery import shared_task
from django.utils import timezone


@shared_task(ignore_result=True)
def prune_pings(days: int = 30):
    from .models import LocationPing

    deleted, _ = LocationPing.objects.filter(created_at__lt=timezone.now() - timedelta(days=days)).delete()
    return deleted
