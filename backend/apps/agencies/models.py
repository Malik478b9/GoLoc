import uuid

from django.conf import settings
from django.db import models

from apps.captains.models import BankAccount, ServiceFields
from apps.common.files import private_storage, upload_to, validate_document, validate_image


class Agency(models.Model):
    """
    A travel business whose Captains work for it (like a fleet partner). Each Captain
    still signs up and is verified by GoLoc, but the agency sets their trips and prices,
    gives them cars, and receives their earnings; it pays the Captains itself.
    Commission is the same as for independent Captains.
    """

    class ReviewStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Needs changes"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=16, unique=True, help_text="Public ID, e.g. AGY-1001.")
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="agency")
    name = models.CharField(max_length=120, help_text="Name travelers see.")
    legal_name = models.CharField(max_length=160, blank=True)
    city = models.ForeignKey("cities.City", on_delete=models.PROTECT, related_name="agencies", help_text="Head office.")
    address = models.CharField(max_length=300, blank=True)
    gstin = models.CharField(max_length=15, blank=True)
    pan = models.CharField(max_length=10, blank=True)
    contact_email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to=upload_to("agencies"), validators=[validate_image], blank=True)

    review_status = models.CharField(max_length=16, choices=ReviewStatus.choices, default=ReviewStatus.DRAFT)
    review_note = models.CharField(max_length=500, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    is_on_hold = models.BooleanField(default=False)
    hold_reason = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "agencies"
        indexes = [models.Index(fields=["review_status", "submitted_at"])]

    def __str__(self):
        return f"{self.code} {self.name}"

    @property
    def is_active_business(self):
        """Its Captains can take bookings only while the agency itself is approved and not on hold."""
        return self.review_status == self.ReviewStatus.APPROVED and not self.is_on_hold


class AgencyPayoutAccount(BankAccount):
    agency = models.OneToOneField(Agency, on_delete=models.CASCADE, primary_key=True, related_name="payout_account")


class AgencyDocument(models.Model):
    class DocType(models.TextChoices):
        REGISTRATION = "registration", "Business registration / incorporation"
        GST = "gst_certificate", "GST certificate"
        PAN = "pan_card", "Business PAN card"
        OWNER_ID = "owner_id", "Owner's government ID"
        TOURISM_LICENCE = "tourism_licence", "Tourism / travel agency licence"

    REQUIRED = (DocType.REGISTRATION, DocType.PAN, DocType.OWNER_ID)

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agency = models.ForeignKey(Agency, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=24, choices=DocType.choices)
    file = models.FileField(upload_to=upload_to("agency-kyc"), storage=private_storage, validators=[validate_document])
    number = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    note = models.CharField(max_length=300, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AgencyInvite(models.Model):
    """An agency asks a Captain (by phone number) to join. The Captain accepts in the Captain app."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agency = models.ForeignKey(Agency, on_delete=models.CASCADE, related_name="invites")
    phone_number = models.CharField(max_length=20, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["agency", "phone_number"], condition=models.Q(status="pending"),
                                    name="one_pending_invite_per_number"),
        ]


class AgencyService(ServiceFields):
    """
    A trip in the agency's catalog. Every one of its Captains in `city` (or in any city
    when blank) offers it at these prices: a ServiceOffer copy per Captain, kept in sync.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agency = models.ForeignKey(Agency, on_delete=models.CASCADE, related_name="services")
    city = models.ForeignKey("cities.City", null=True, blank=True, on_delete=models.PROTECT, related_name="+",
                             help_text="Only Captains in this city offer it. Blank = all of the agency's Captains.")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["kind", "title"]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(kind__in=["experience", "guide"], price__gt=0))
                | models.Q(kind="package", normal_price__gt=0, medium_price__gte=models.F("normal_price"),
                           lavish_price__gte=models.F("medium_price")),
                name="agency_service_prices_valid",
            ),
        ]
