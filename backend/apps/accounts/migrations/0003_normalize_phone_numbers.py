"""
Convert phone numbers saved before this release ("9876543210") to E.164
("+919876543210") so they match what the new login flow looks up.

If two old rows would collapse onto the same number (e.g. "09876543210" and
"9876543210"), the older account keeps the number and the newer one is left
unchanged and reported, so nothing is silently merged or deleted.
"""
import re

from django.db import migrations


def _normalize(raw: str) -> str | None:
    value = re.sub(r"[\s\-().]", "", raw or "")
    if value.startswith("00"):
        value = "+" + value[2:]
    if value.startswith("+"):
        return value if re.fullmatch(r"\+[1-9]\d{7,14}", value) else None
    if not value.isdigit():
        return None
    value = value.lstrip("0")
    if len(value) == 10:
        return "+91" + value
    if len(value) == 12 and value.startswith("91"):
        return "+" + value
    return None


def forwards(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    taken = set(User.objects.filter(phone_number__startswith="+").values_list("phone_number", flat=True))
    skipped = []
    for user in User.objects.exclude(phone_number__startswith="+").order_by("created_at"):
        new = _normalize(user.phone_number)
        if not new or new in taken:
            skipped.append(str(user.pk))
            continue
        taken.add(new)
        user.phone_number = new
        user.save(update_fields=["phone_number"])
    if skipped:
        print(f"\n  [accounts.0003] Left {len(skipped)} phone number(s) unchanged (invalid or duplicate). "
              f"User ids: {', '.join(skipped)}")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_user_city_otpchallenge")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
