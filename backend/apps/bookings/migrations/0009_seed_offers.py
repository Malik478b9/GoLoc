from django.db import migrations

OFFERS = [
    {
        "code": "FIRSTTRIP", "title": "10% off your first trip", "kind": "percent", "value": 10, "max_discount": 500,
        "description": "For travelers booking their first GoLoc trip. Up to ₹500 off the fare.",
        "first_trip_only": True, "auto_apply": True, "per_user_limit": 1,
    },
    {
        "code": "PAY3GET4", "title": "Book 4 seats, pay for 3", "kind": "free_seat", "value": 1, "min_guests": 4,
        "description": "On group trips: your 4th seat is free. Once per traveler.",
        "trip_kind": "group", "auto_apply": True, "per_user_limit": 1,
    },
]


def seed(apps, schema_editor):
    Coupon = apps.get_model("bookings", "Coupon")
    for o in OFFERS:
        Coupon.objects.get_or_create(code=o["code"], defaults=o)


class Migration(migrations.Migration):
    dependencies = [("bookings", "0008_offers")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
