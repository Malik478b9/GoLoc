"""
Seed the pilot cities so the city picker isn't empty on a fresh install.
Safe to re-run: existing cities (matched by slug) are left untouched, so
anything Admin has changed in production is never overwritten.
"""
from django.db import migrations

PILOT_CITIES = [
    # name, slug, state, lat, lng, sort_order
    ("Jaipur", "jaipur", "Rajasthan", "26.912434", "75.787270", 1),
    ("Udaipur", "udaipur", "Rajasthan", "24.585445", "73.712479", 2),
    ("Jodhpur", "jodhpur", "Rajasthan", "26.238947", "73.024309", 3),
    ("Goa", "goa", "Goa", "15.299326", "74.123996", 4),
    ("Hyderabad", "hyderabad", "Telangana", "17.385044", "78.486671", 5),
    ("Varanasi", "varanasi", "Uttar Pradesh", "25.317645", "82.973914", 6),
    ("Rishikesh", "rishikesh", "Uttarakhand", "30.086927", "78.267609", 7),
    ("Manali", "manali", "Himachal Pradesh", "32.243200", "77.189200", 8),
]


def seed(apps, schema_editor):
    City = apps.get_model("cities", "City")
    for name, slug, state, lat, lng, order in PILOT_CITIES:
        City.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "state": state,
                "latitude": lat,
                "longitude": lng,
                "sort_order": order,
                "is_live": True,
                "launch_phase": 1,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("cities", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
