"""
National emergency numbers (India), shown in every city. Local police
stations and hospitals are added per city by Admin (Admin → Emergency) —
we never ship made-up local numbers.
"""
from django.db import migrations

NATIONAL = [
    # kind, name, phone, order
    ("emergency", "National Emergency (ERSS)", "112", 1),
    ("police", "Police", "100", 2),
    ("ambulance", "Ambulance", "108", 3),
    ("helpline", "Women Helpline", "1091", 4),
    ("helpline", "Tourist Helpline (Incredible India)", "1800111363", 5),
    ("emergency", "Fire", "101", 6),
]


def seed(apps, schema_editor):
    EmergencyService = apps.get_model("trips", "EmergencyService")
    for kind, name, phone, order in NATIONAL:
        EmergencyService.objects.get_or_create(city=None, phone=phone, defaults={"kind": kind, "name": name, "sort_order": order})


class Migration(migrations.Migration):
    dependencies = [("trips", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
