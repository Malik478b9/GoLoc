import uuid

from django.db import models


class City(models.Model):
    """
    A city GoLoc operates in. Captains will be bound to a home city (BR-1);
    Travelers pick the city they're exploring. Only `is_live` cities are
    shown in the apps — Admin flips this to launch a new city.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    state = models.CharField(max_length=100, blank=True)
    is_live = models.BooleanField(default=False, help_text="Shown in the apps and open for bookings.")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    launch_phase = models.PositiveSmallIntegerField(default=1, help_text="Go-to-market phase (1 = pilot).")
    sort_order = models.PositiveSmallIntegerField(default=100, help_text="Lower shows first in pickers.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "cities"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name
