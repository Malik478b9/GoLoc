from celery import shared_task


@shared_task(ignore_result=True)
def expire_stale_bookings():
    from .groups import settle_undersubscribed
    from .services import expire_stale

    return expire_stale() + settle_undersubscribed()
