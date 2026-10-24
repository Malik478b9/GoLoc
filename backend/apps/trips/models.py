from django.conf import settings
from django.db import models


class LocationPing(models.Model):
    id = models.BigAutoField(primary_key=True)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.CASCADE, related_name="pings")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=10)
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy_m = models.PositiveIntegerField(null=True, blank=True)
    heading = models.FloatField(null=True, blank=True)
    speed_mps = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["booking", "role", "-created_at"])]


class SOSAlert(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        RESOLVED = "resolved", "Resolved"
        FALSE_ALARM = "false_alarm", "False alarm"

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=16, unique=True)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, related_name="sos_alerts")
    raised_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sos_alerts")
    role = models.CharField(max_length=10)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    message = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=14, choices=Status.choices, default=Status.OPEN)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    notes = models.TextField(blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]


class EmergencyService(models.Model):
    class Kind(models.TextChoices):
        EMERGENCY = "emergency", "All emergencies"
        POLICE = "police", "Police"
        HOSPITAL = "hospital", "Hospital"
        AMBULANCE = "ambulance", "Ambulance"
        HELPLINE = "helpline", "Helpline"

    id = models.BigAutoField(primary_key=True)
    city = models.ForeignKey("cities.City", null=True, blank=True, on_delete=models.CASCADE,
                             help_text="Empty = national, shown everywhere.")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=30)
    address = models.CharField(max_length=250, blank=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "name"]
