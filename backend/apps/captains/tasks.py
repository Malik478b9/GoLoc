from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from .models import CaptainProfile


@shared_task
def sweep_inactive_captains():
    """
    BR-3: No activity > 1 month -> On Hold until Admin release.
    Scheduled every 6 hours via CELERY_BEAT_SCHEDULE (see goloc/settings.py).
    "Activity" = last_activity_at, bumped on go-live, availability updates,
    accepted bookings, or completed trips.
    """
    cutoff = timezone.now() - timedelta(days=30)
    stale = CaptainProfile.objects.filter(
        lifecycle_status=CaptainProfile.LifecycleStatus.LIVE
    ).filter(Q(last_activity_at__lt=cutoff) | Q(last_activity_at__isnull=True))

    count = stale.update(lifecycle_status=CaptainProfile.LifecycleStatus.ON_HOLD)
    return {"captains_put_on_hold": count}
