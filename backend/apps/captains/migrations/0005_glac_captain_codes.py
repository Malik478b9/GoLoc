from django.db import migrations

OLD, NEW = "CAP", "GLAC"


def forwards(apps, schema_editor):
    """Captain IDs become GLAC-1001 style. Same number, new prefix; the counter carries on."""
    CaptainProfile = apps.get_model("captains", "CaptainProfile")
    PublicCounter = apps.get_model("common", "PublicCounter")
    for c in CaptainProfile.objects.filter(code__startswith=f"{OLD}-"):
        c.code = f"{NEW}-{c.code[len(OLD) + 1:]}"
        c.save(update_fields=["code"])
    old = PublicCounter.objects.filter(name=OLD).first()
    if old:
        new, _ = PublicCounter.objects.get_or_create(name=NEW, defaults={"value": old.value})
        if new.value < old.value:
            new.value = old.value
            new.save(update_fields=["value"])


def backwards(apps, schema_editor):
    CaptainProfile = apps.get_model("captains", "CaptainProfile")
    for c in CaptainProfile.objects.filter(code__startswith=f"{NEW}-"):
        c.code = f"{OLD}-{c.code[len(NEW) + 1:]}"
        c.save(update_fields=["code"])


class Migration(migrations.Migration):
    dependencies = [
        ("captains", "0004_captainprofile_agency_and_more"),
        ("common", "0001_initial"),
    ]
    operations = [migrations.RunPython(forwards, backwards)]
