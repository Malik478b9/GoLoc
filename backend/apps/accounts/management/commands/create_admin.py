"""
Grant admin-console access to a phone number. This is the only way to make
an admin — the apps never let anyone sign up as one.

    python manage.py create_admin 9876543210 --name "Ops Lead"
    python manage.py create_admin 9876543210 --superuser   # also full Django admin rights
    python manage.py create_admin 9876543210 --revoke
"""
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.accounts.phone import InvalidPhoneNumber, normalize_phone


class Command(BaseCommand):
    help = "Create or update an admin account (OTP sign-in, no password)."

    def add_arguments(self, parser):
        parser.add_argument("phone_number")
        parser.add_argument("--name", default="")
        parser.add_argument("--superuser", action="store_true", help="Also grant full Django admin permissions.")
        parser.add_argument("--revoke", action="store_true", help="Remove admin access instead.")

    def handle(self, phone_number, name, superuser, revoke, **options):
        try:
            phone = normalize_phone(phone_number)
        except InvalidPhoneNumber as exc:
            raise CommandError(str(exc)) from exc

        if revoke:
            updated = User.objects.filter(phone_number=phone).update(is_staff=False, is_superuser=False)
            if not updated:
                raise CommandError(f"No account for {phone}.")
            self.stdout.write(self.style.SUCCESS(f"Admin access removed for {phone}."))
            return

        user, created = User.objects.get_or_create(
            phone_number=phone, defaults={"full_name": name, "role": User.Role.ADMIN}
        )
        if created:
            user.set_unusable_password()
        if name:
            user.full_name = name
        user.is_staff = True
        user.is_superuser = user.is_superuser or superuser
        user.is_active = True
        user.save()
        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{verb} admin {phone}. They can now sign in to the admin console."))
