import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone

from apps.common.api import conflict
from apps.common.models import next_public_code

from .ai import GenerationError, generate
from .models import Itinerary

logger = logging.getLogger("goloc.itineraries")


def create(captain, **fields) -> Itinerary:
    it = Itinerary(code=next_public_code("ITN"), captain=captain, **fields)
    if it.start_date and not it.end_date:
        it.end_date = it.start_date + timedelta(days=it.days - 1)
    it.save()
    return it


def start_generation(it: Itinerary, instructions: str = "") -> Itinerary:
    """Mark as generating and hand off. The apps poll until status is ready/failed."""
    with transaction.atomic():
        it = Itinerary.objects.select_for_update().get(pk=it.pk)
        if it.status == Itinerary.Status.GENERATING:
            raise conflict("The AI is already writing this itinerary.", "already_generating")
        it.status = Itinerary.Status.GENERATING
        it.error = ""
        it.save(update_fields=["status", "error", "updated_at"])

    if settings.ITINERARY_SYNC:
        run(it.pk, instructions)
    elif settings.CELERY_TASK_ALWAYS_EAGER:
        # No broker (laptop): an eager task would block this request for the whole AI call.
        threading.Thread(target=_run_in_thread, args=(it.pk, instructions), daemon=True).start()
    else:
        from .tasks import generate_itinerary

        transaction.on_commit(lambda: generate_itinerary.delay(str(it.pk), instructions))
    return it


def _run_in_thread(pk, instructions):
    try:
        run(pk, instructions)
    finally:
        close_old_connections()


def run(pk, instructions: str = "") -> None:
    it = Itinerary.objects.select_related("captain__user", "captain__city", "service", "based_on").get(pk=pk)
    try:
        draft = generate(it, instructions)
    except GenerationError as exc:
        Itinerary.objects.filter(pk=pk).update(status=Itinerary.Status.FAILED, error=str(exc)[:300], updated_at=timezone.now())
        return
    except Exception:  # noqa: BLE001 — never leave an itinerary stuck on "generating"
        logger.exception("Itinerary %s generation crashed", it.code)
        Itinerary.objects.filter(pk=pk).update(status=Itinerary.Status.FAILED, error="Something went wrong. Try again.",
                                               updated_at=timezone.now())
        return
    Itinerary.objects.filter(pk=pk).update(
        content=draft.content, poster=draft.poster, ai_model=draft.model, status=Itinerary.Status.READY,
        generated_at=timezone.now(), error="", edited_by_hand=False, updated_at=timezone.now(),
    )
