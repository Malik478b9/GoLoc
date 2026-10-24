from celery import shared_task


@shared_task(ignore_result=True)
def expire_stale_bookings():
    from .services import expire_stale

    return expire_stale()
