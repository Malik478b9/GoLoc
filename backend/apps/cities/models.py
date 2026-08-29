import uuid

from django.db import models


class City(models.Model):
    """
    Backs BR-1 (city-bound Captains). Admin controls which cities are live
    and can expand a Captain's operating area beyond their home city.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    state = models.CharField(max_length=100, blank=True)
    is_live = models.BooleanField(default=False, help_text="Whether GoLoc is publicly launched here.")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    launch_phase = models.PositiveSmallIntegerField(
        default=1, help_text="GTM phase this city belongs to (1 = pilot city)."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "cities"
        ordering = ["name"]

    def __str__(self):
        return self.name
