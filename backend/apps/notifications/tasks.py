import logging

from celery import shared_task

from .models import Notification

logger = logging.getLogger("goloc.push")


@shared_task(bind=True, max_retries=3, default_retry_delay=20, ignore_result=True)
def send_push(self, notification_id: int):
    from .service import deliver

    note = Notification.objects.filter(pk=notification_id).select_related("user").first()
    if not note:
        return
    try:
        deliver(note)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Push %s failed: %s", notification_id, exc)
        raise self.retry(exc=exc)
