"""Delete OTP records older than N days (default 30). Run daily from cron."""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import OTPChallenge


class Command(BaseCommand):
    help = "Delete old OTP challenge records."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30)

    def handle(self, days, **options):
        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = OTPChallenge.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(f"Deleted {deleted} OTP records older than {days} days.")
