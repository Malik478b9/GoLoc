from django.db import models, transaction


class PublicCounter(models.Model):
    """
    Monotonic counters behind the human-friendly IDs support staff read out
    over the phone (CAP-1001, BKG-8001, …). One row per prefix; incremented
    under a row lock so two requests never get the same number.
    """

    name = models.CharField(max_length=16, primary_key=True)
    value = models.PositiveBigIntegerField(default=0)

    def __str__(self):
        return f"{self.name}={self.value}"


START_AT = {"CAP": 1001, "BKG": 8001, "PO": 2001, "SOS": 3001, "TKT": 5001}


def next_public_code(prefix: str) -> str:
    with transaction.atomic():
        counter, _ = PublicCounter.objects.select_for_update().get_or_create(
            name=prefix, defaults={"value": START_AT.get(prefix, 1001) - 1}
        )
        counter.value += 1
        counter.save(update_fields=["value"])
        return f"{prefix}-{counter.value}"
