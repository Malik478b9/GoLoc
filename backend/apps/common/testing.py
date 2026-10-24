"""Factories for API tests: real users, real JWTs (with the role claim), real rows."""
import io
from datetime import timedelta

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import issue_tokens
from apps.captains.models import CaptainProfile, PayoutAccount, ServiceOffer, VerificationDocument
from apps.captains.services import create_profile
from apps.cities.models import City

_counter = [0]


def phone():
    _counter[0] += 1
    return f"+9198{_counter[0]:08d}"


def client_for(user, role):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user, role)['access']}")
    return c


def png(name="photo.png"):
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (47, 122, 107)).save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


def pdf(name="id.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4\n%test\n", content_type="application/pdf")


def city(slug="hyderabad"):
    return City.objects.get(slug=slug)


def make_user(name="Test User", staff=False):
    return User.objects.create_user(phone_number=phone(), full_name=name, phone_verified=True, is_staff=staff)


def make_live_captain(name="Ahmed Khan", city_slug="hyderabad", price=3500, package=False, capacity=1) -> CaptainProfile:
    """An approved, live Captain with one experience (and optionally a package), Mon–Sat availability."""
    user = make_user(name)
    profile = create_profile(user, city(city_slug), bio="Old City food & heritage", languages=["English", "Hindi"],
                             categories=["food", "heritage"], max_bookings_per_day=capacity)
    ServiceOffer.objects.create(captain=profile, kind="experience", title="Old City Food Trail", category="food",
                                price=price, included_guests=2, extra_guest_price=400, max_guests=6, stops=["Charminar", "Laad Bazaar"])
    if package:
        ServiceOffer.objects.create(captain=profile, kind="package", title="Leh Explorer", category="adventure",
                                    duration_days=6, normal_price=28000, medium_price=48000, lavish_price=95000, max_guests=4)
    profile.weekly_slots.update(is_available=True)
    VerificationDocument.objects.create(captain=profile, doc_type="id_proof", file=pdf(), status="approved")
    PayoutAccount.objects.create(captain=profile, method="upi", account_holder=name, upi_id="ahmed@okbank")
    profile.review_status = CaptainProfile.ReviewStatus.APPROVED
    profile.is_live = True
    profile.save()
    return profile


def next_weekday(days_ahead=5):
    """A date at least `days_ahead` out that isn't a Sunday (default slots are Mon–Sat)."""
    d = timezone.localdate() + timedelta(days=days_ahead)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d


def reset():
    cache.clear()
