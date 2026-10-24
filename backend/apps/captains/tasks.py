from celery import shared_task


@shared_task(ignore_result=True)
def apply_inactivity_holds():
    from .services import apply_inactivity_holds as run

    return run()
