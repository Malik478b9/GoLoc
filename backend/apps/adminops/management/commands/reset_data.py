"""
Wipe marketplace data so you can test from a clean slate (development only).

    python manage.py reset_data            # asks for confirmation
    python manage.py reset_data --yes

Keeps: cities, emergency numbers, and admin (staff) accounts.
Deletes: every traveler and Captain account and everything they created —
profiles, services, documents, bookings, payments, payouts, reels, chats,
reviews, tickets, notifications, uploaded files and the ID counters
(so the next Captain is CAP-1001 and the next booking BKG-8001 again).
"""
import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import OTPChallenge, TravelerProfile, User
from apps.adminops.models import AdminAction
from apps.bookings.models import Booking, BookingEvent
from apps.captains.models import CaptainProfile
from apps.chat.models import Conversation
from apps.common.models import PublicCounter
from apps.notifications.models import Device, Notification
from apps.payments.models import LedgerEntry, Payment, Payout, Refund, WebhookEvent
from apps.reviews.models import Review
from apps.social.models import Post
from apps.support.models import Ticket
from apps.trips.models import LocationPing, SOSAlert


class Command(BaseCommand):
    help = "Delete all travelers, Captains and their data. Keeps cities, emergency numbers and admins."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Don't ask for confirmation.")

    def handle(self, yes=False, **options):
        if not settings.DEBUG:
            raise CommandError("reset_data only runs with DEBUG=True.")
        if not yes and input("Delete ALL travelers, Captains, bookings and uploads? Type 'yes': ").strip() != "yes":
            self.stdout.write("Cancelled.")
            return
        with transaction.atomic():
            # Children before parents (PROTECT foreign keys).
            for model in (LocationPing, SOSAlert, Review, Ticket, Refund, LedgerEntry, Payment, Payout, BookingEvent,
                          WebhookEvent, Conversation, Post, Notification, Device, AdminAction):
                model.objects.all().delete()
            Booking.objects.all().delete()
            CaptainProfile.objects.all().delete()
            TravelerProfile.objects.all().delete()
            OTPChallenge.objects.all().delete()
            removed, _ = User.objects.filter(is_staff=False).delete()
            PublicCounter.objects.all().delete()
            User.objects.filter(is_staff=True).update(city=None)
        for folder in (Path(settings.MEDIA_ROOT), Path(settings.STORAGES["private"].get("OPTIONS", {}).get("location", ""))):
            if folder.name in {"media", "private_media"} and folder.exists():
                shutil.rmtree(folder, ignore_errors=True)
        from django.core.cache import cache

        cache.clear()
        admins = ", ".join(User.objects.filter(is_staff=True).values_list("phone_number", flat=True)) or "none"
        self.stdout.write(self.style.SUCCESS(f"Clean slate. Admin accounts kept: {admins}"))
