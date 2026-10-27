from celery import shared_task


@shared_task(ignore_result=True, acks_late=True)
def generate_itinerary(pk: str, instructions: str = ""):
    from .services import run

    run(pk, instructions)
