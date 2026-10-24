"""
Fill a development database with demo Captains so every app has something to show.

    python manage.py seed_demo                 # 6 live Captains in Hyderabad + Jaipur
    python manage.py seed_demo --admin 9876543210

Demo Captains sign in with phone 900000000N (N = 1…6) and, with
OTP_DEV_FIXED_CODE=123456 in .env, code 123456. Refuses to run with DEBUG=False.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.captains.models import CaptainProfile, PayoutAccount, ServiceOffer
from apps.captains.services import create_profile
from apps.cities.models import City

DEMO = [
    ("9000000001", "Ahmed Khan", "hyderabad", "Old City food & heritage", ["food", "heritage"], ["English", "Hindi", "Urdu"], 8,
     [("experience", "Old City Food Trail", "food", 3500, ["Charminar", "Laad Bazaar", "Pista House", "Nimrah Café"]),
      ("package", "Leh · Ladakh Explorer", "adventure", (28000, 48000, 95000), None)]),
    ("9000000002", "Sana Mirza", "hyderabad", "Blue-hour photography walks", ["photography", "culture"], ["English", "Hindi", "Telugu"], 5,
     [("experience", "Charminar Sunrise Photo Walk", "photography", 1800, ["Charminar", "Mecca Masjid"])]),
    ("9000000003", "Ravi Varma", "hyderabad", "History & architecture", ["heritage", "culture"], ["English", "Telugu"], 12,
     [("experience", "Qutb Shahi Heritage Day", "heritage", 4200, ["Golconda Fort", "Qutb Shahi Tombs", "Taramati Baradari"])]),
    ("9000000004", "Nisha Kapoor", "hyderabad", "Markets & street food", ["shopping", "food"], ["English", "Hindi"], 3,
     [("experience", "Laad Bazaar Shopping Walk", "shopping", 1500, ["Laad Bazaar", "Pathar Gatti"])]),
    ("9000000005", "Vikram Rathore", "jaipur", "Royal Rajasthan, slow travel", ["heritage", "culture"], ["English", "Hindi", "Rajasthani"], 10,
     [("experience", "Amber Fort & Stepwells", "heritage", 3800, ["Amber Fort", "Panna Meena ka Kund", "Jal Mahal"]),
      ("package", "Jaipur Royal Week", "heritage", (22000, 38000, 72000), None)]),
    ("9000000006", "Meera Joshi", "jaipur", "Home kitchens & crafts", ["food", "culture"], ["English", "Hindi"], 6,
     [("experience", "Rajasthani Home Cooking", "food", 1200, ["Johari Bazaar", "Family kitchen"])]),
]

ITINERARY = ["Arrive · check-in · easy evening walk", "Local sights · café stop", "Day trip · scenic drive",
             "Highlight day · sunset viewpoint", "Free morning · market", "Departure transfer"]
INCLUSIONS = {
    "normal": ["Guesthouse / 2★ stay", "Local meals (2/day)", "Shared cab segments", "Captain host & permits"],
    "medium": ["3★ hotel · double room", "Hotel + curated local food", "Private cab", "Captain host & permits"],
    "lavish": ["4–5★ boutique stay", "Fine dining + chef night", "Private SUV all legs", "Priority support"],
}


class Command(BaseCommand):
    help = "Create demo Captains (development only)."

    def add_arguments(self, parser):
        parser.add_argument("--admin", help="Also grant admin access to this phone number.")

    @transaction.atomic
    def handle(self, admin=None, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG=True.")
        for phone, name, city_slug, tagline, cats, langs, years, services in DEMO:
            user, _ = User.objects.get_or_create(phone_number=f"+91{phone}", defaults={"full_name": name, "phone_verified": True})
            if hasattr(user, "captain_profile"):
                continue
            city = City.objects.get(slug=city_slug)
            profile = create_profile(user, city, tagline=tagline, bio=f"{tagline}. Born and raised here — {years} years hosting travelers.",
                                     languages=langs, categories=cats, years_experience=years)
            for kind, title, cat, price, stops in services:
                if kind == "experience":
                    ServiceOffer.objects.create(captain=profile, kind=kind, title=title, category=cat, price=price,
                                                included_guests=2, extra_guest_price=400, max_guests=6, duration_hours=4, stops=stops)
                else:
                    ServiceOffer.objects.create(captain=profile, kind=kind, title=title, category=cat, duration_days=6,
                                                normal_price=price[0], medium_price=price[1], lavish_price=price[2], max_guests=4,
                                                itinerary=ITINERARY, tier_inclusions=INCLUSIONS)
            PayoutAccount.objects.create(captain=profile, method="upi", account_holder=name, upi_id=f"{name.split()[0].lower()}@okdemo")
            profile.review_status = CaptainProfile.ReviewStatus.APPROVED
            profile.is_live = True
            profile.save()
            self.stdout.write(f"  {profile.code}  {name:<16} {city.name:<10} phone {phone}")
        if admin:
            from django.core.management import call_command

            call_command("create_admin", admin, "--name", "Demo Admin")
        self.stdout.write(self.style.SUCCESS("Demo data ready. Sign in with OTP 123456 if OTP_DEV_FIXED_CODE=123456."))
