from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Review(models.Model):
    id = models.BigAutoField(primary_key=True)
    booking = models.OneToOneField("bookings.Booking", on_delete=models.CASCADE, related_name="review")
    captain = models.ForeignKey("captains.CaptainProfile", on_delete=models.CASCADE, related_name="reviews")
    traveler = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.CharField(max_length=1000, blank=True)
    captain_reply = models.CharField(max_length=1000, blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    is_hidden = models.BooleanField(default=False)
    hidden_reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["captain", "is_hidden", "-created_at"])]
        constraints = [models.CheckConstraint(condition=models.Q(rating__gte=1, rating__lte=5), name="review_rating_1_5")]
