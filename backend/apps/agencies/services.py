"""
Agency rules. An agency's Captains:
  - offer the agency's trips at the agency's prices (copies of AgencyService, kept in sync);
  - drive the agency's cars;
  - earn into the agency's wallet (Booking.agency → LedgerEntry.agency); the agency pays them itself.
A request sent to one of its Captains can go to any free Captain of the same agency:
the agency can reassign it, and a Captain's decline is passed to a free colleague first.
"""
from django.db import transaction
from django.utils import timezone

from apps.accounts.phone import InvalidPhoneNumber, normalize_phone
from apps.common.api import bad_request, conflict
from apps.common.models import next_public_code
from apps.notifications.service import notify, notify_admins

from .models import Agency, AgencyDocument, AgencyInvite, AgencyService


def create_agency(user, **fields) -> Agency:
    return Agency.objects.create(code=next_public_code("AGY"), owner=user, **fields)


def checklist(agency: Agency) -> dict:
    docs = {}
    for d in agency.documents.all():  # newest first
        docs.setdefault(d.doc_type, d.status)
    items = [
        {"key": "profile", "label": "Business details (name, head office, PAN)", "done": bool(agency.name and agency.pan and agency.address)},
        {"key": "documents", "label": "Registration, business PAN and owner's ID uploaded",
         "done": all(docs.get(t) in {"pending", "approved"} for t in AgencyDocument.REQUIRED)},
        {"key": "payout", "label": "UPI or bank account for payouts", "done": hasattr(agency, "payout_account")},
        {"key": "approved", "label": "Approved by GoLoc", "done": agency.review_status == Agency.ReviewStatus.APPROVED},
    ]
    return {
        "items": items,
        "percent": round(sum(i["done"] for i in items) * 100 / len(items)),
        "can_submit": all(i["done"] for i in items[:-1])
        and agency.review_status in {Agency.ReviewStatus.DRAFT, Agency.ReviewStatus.REJECTED},
    }


def require_active(agency: Agency):
    if not agency.is_active_business:
        raise conflict("This is available once GoLoc approves your agency." if not agency.is_on_hold
                       else "Your agency is on hold. Contact GoLoc support.", "agency_not_active")


# ---------------------------------------------------------------- trips (catalog → each Captain's services)
def _eligible(service: AgencyService, captain) -> bool:
    return (service.is_active and captain.agency_id == service.agency_id
            and (service.city_id is None or service.city_id == captain.city_id)
            # Guides don't sell full-service packages, agency or not.
            and not (service.kind == service.Kind.PACKAGE and captain.captain_type == captain.Type.GUIDE))


def _copy_onto(service: AgencyService, captain):
    from apps.captains.models import ServiceOffer

    values = {f: getattr(service, f) for f in AgencyService.COPIED_FIELDS}
    copy = ServiceOffer.objects.filter(captain=captain, agency_service=service).first()
    if copy is None:
        if not _eligible(service, captain):
            return
        ServiceOffer.objects.create(captain=captain, agency_service=service, is_active=True, **values)
        return
    for k, v in values.items():
        setattr(copy, k, v)
    copy.is_active = _eligible(service, captain)
    copy.save()


def sync_service(service: AgencyService):
    """After the agency edits a trip: every Captain's copy matches, and only eligible Captains offer it."""
    from apps.captains.models import CaptainProfile

    captains = CaptainProfile.objects.filter(agency=service.agency) | CaptainProfile.objects.filter(services__agency_service=service)
    with transaction.atomic():
        for captain in captains.distinct():
            _copy_onto(service, captain)


def sync_captain(captain):
    """After a Captain joins or leaves: their agency trips match the catalog (or are switched off)."""
    from apps.captains.models import ServiceOffer

    with transaction.atomic():
        if captain.agency_id:
            for service in AgencyService.objects.filter(agency_id=captain.agency_id):
                _copy_onto(service, captain)
        ServiceOffer.objects.filter(captain=captain, agency_service__isnull=False).exclude(
            agency_service__agency_id=captain.agency_id).update(is_active=False, updated_at=timezone.now())


# ---------------------------------------------------------------- membership
def invite(agency: Agency, phone: str) -> AgencyInvite:
    from apps.captains.models import CaptainProfile

    require_active(agency)
    try:
        phone = normalize_phone(phone)
    except InvalidPhoneNumber as exc:
        raise bad_request(str(exc), "invalid_phone") from exc
    existing = CaptainProfile.objects.filter(user__phone_number=phone).select_related("agency").first()
    if existing and existing.agency_id == agency.id:
        raise conflict("This Captain is already in your agency.", "already_member")
    if existing and existing.agency_id:
        raise conflict("This Captain works for another agency.", "other_agency")
    invite, created = AgencyInvite.objects.get_or_create(agency=agency, phone_number=phone, status=AgencyInvite.Status.PENDING)
    if created and existing:
        notify(existing.user, "captain", "agency_invite", f"{agency.name} invited you",
               "Join their team: they set your trips and prices and pay you directly.", {"invite_id": invite.id})
    return invite


def accept_invite(invite: AgencyInvite, captain) -> None:
    from apps.bookings.models import Booking
    from apps.captains.models import CaptainProfile

    with transaction.atomic():
        invite = AgencyInvite.objects.select_for_update().select_related("agency__owner").get(pk=invite.pk)
        captain = CaptainProfile.objects.select_for_update().get(pk=captain.pk)
        if invite.status != AgencyInvite.Status.PENDING or invite.phone_number != captain.user.phone_number:
            raise conflict("This invite is no longer open.", "invite_closed")
        if captain.agency_id:
            raise conflict("Leave your current agency first.", "other_agency")
        if not invite.agency.is_active_business:
            raise conflict("This agency isn't active on GoLoc right now.", "agency_not_active")
        if Booking.objects.filter(captain=captain, status__in=Booking.ACTIVE).exists():
            raise conflict("Finish or cancel your open bookings before joining an agency.", "open_bookings")
        captain.agency = invite.agency
        captain.agency_joined_at = timezone.now()
        captain.save(update_fields=["agency", "agency_joined_at", "updated_at"])
        # The agency sets trips and prices now: the Captain's own listings go quiet.
        captain.services.filter(agency_service__isnull=True, is_active=True).update(is_active=False, updated_at=timezone.now())
        invite.status = AgencyInvite.Status.ACCEPTED
        invite.responded_at = timezone.now()
        invite.save(update_fields=["status", "responded_at"])
        AgencyInvite.objects.filter(phone_number=invite.phone_number, status=AgencyInvite.Status.PENDING).exclude(
            pk=invite.pk).update(status=AgencyInvite.Status.CANCELLED, responded_at=timezone.now())
        sync_captain(captain)
    notify(invite.agency.owner, "agency", "captain_joined", f"{captain.name} joined {invite.agency.name}",
           f"{captain.code} · {captain.city.name}", {"captain_id": captain.id})


def decline_invite(invite: AgencyInvite) -> None:
    if invite.status != AgencyInvite.Status.PENDING:
        raise conflict("This invite is no longer open.", "invite_closed")
    invite.status = AgencyInvite.Status.DECLINED
    invite.responded_at = timezone.now()
    invite.save(update_fields=["status", "responded_at"])


def leave(captain, by: str) -> None:
    """The Captain goes independent (by="captain") or the agency lets them go (by="agency")."""
    from apps.bookings.models import Booking
    from apps.captains.models import CaptainProfile

    with transaction.atomic():
        captain = CaptainProfile.objects.select_for_update().select_related("agency__owner", "user").get(pk=captain.pk)
        agency = captain.agency
        if agency is None:
            raise conflict("This Captain isn't part of an agency.", "no_agency")
        if Booking.objects.filter(captain=captain, agency=agency, status__in=Booking.ACTIVE).exists():
            raise conflict("There are open agency bookings for this Captain. Reassign or finish them first.", "open_bookings")
        captain.agency = None
        captain.agency_joined_at = None
        # No agency trips any more: off air until they list their own services.
        captain.is_live = False
        captain.save(update_fields=["agency", "agency_joined_at", "is_live", "updated_at"])
        agency.vehicles.filter(captain=captain).update(captain=None)
        sync_captain(captain)
    if by == "captain":
        notify(agency.owner, "agency", "captain_left", f"{captain.name} left {agency.name}", captain.code, {"captain_id": captain.id})
    else:
        notify(captain.user, "captain", "agency_removed", f"You're no longer with {agency.name}",
               "You're independent now: add your own services and payout account to go live again.", {})


# ---------------------------------------------------------------- bookings
def candidates(booking) -> list:
    """Free Captains of the booking's agency who offer the same agency trip, best rated first."""
    from apps.captains.models import CaptainProfile
    from apps.captains.services import free_for_trip

    template_id = booking.service.agency_service_id
    if not booking.agency_id or not template_id:
        return []
    pool = (CaptainProfile.objects.filter(agency_id=booking.agency_id, city_id=booking.city_id, is_on_hold=False,
                                          review_status=CaptainProfile.ReviewStatus.APPROVED,
                                          services__agency_service_id=template_id, services__is_active=True)
            .exclude(pk=booking.captain_id).select_related("user").distinct())
    pool = [c for c in pool if not c.user_id == booking.traveler_id]
    free = free_for_trip({c.pk: c.max_bookings_per_day for c in pool}, booking.start_date, booking.end_date)
    return sorted((c for c in pool if c.pk in free), key=lambda c: (-float(c.rating_avg), -c.trips_completed))


def reassign(booking, new_captain, user, role: str):
    """Move an open agency booking to another of its Captains (same trip, same price)."""
    from apps.bookings.models import Booking
    from apps.bookings.services import log
    from apps.captains.models import CaptainProfile
    from apps.captains.services import unavailable_reason

    with transaction.atomic():
        booking = Booking.objects.select_for_update().select_related("captain__user", "traveler", "service").get(pk=booking.pk)
        if booking.status not in (Booking.Status.REQUESTED, Booking.Status.ACCEPTED, Booking.Status.CONFIRMED):
            raise conflict("Only trips that haven't started can be reassigned.", "not_reassignable")
        if not booking.agency_id or new_captain.agency_id != booking.agency_id:
            raise bad_request("Choose a Captain from your agency.", "not_in_agency")
        if new_captain.pk == booking.captain_id:
            raise bad_request("This Captain already has the trip.", "same_captain")
        if new_captain.city_id != booking.city_id:
            raise bad_request(f"Choose a Captain based in {booking.city.name}.", "wrong_city")
        copy = new_captain.services.filter(agency_service_id=booking.service.agency_service_id, is_active=True).first()
        if copy is None or not booking.service.agency_service_id:
            raise bad_request(f"{new_captain.name} doesn't offer this trip.", "service_missing")
        CaptainProfile.objects.select_for_update().get(pk=new_captain.pk)
        reason = unavailable_reason(new_captain, booking.start_date, booking.end_date)
        if reason:
            raise conflict(reason, "unavailable")
        old = booking.captain
        booking.captain = new_captain
        booking.service = copy
        booking.save(update_fields=["captain", "service", "updated_at"])
        log(booking, user, role, "reassigned", f"Reassigned from {old.name} to {new_captain.name}",
            from_captain=str(old.code), to_captain=str(new_captain.code))
    notify(new_captain.user, "captain", "booking_assigned", f"New trip assigned · {booking.code}",
           f"{booking.service_snapshot.get('title', '')} · {booking.start_date:%d %b}", {"booking_id": booking.id})
    if booking.status != Booking.Status.REQUESTED:
        notify(old.user, "captain", "booking_unassigned", f"{booking.code} moved to a colleague", "Your agency reassigned this trip.",
               {"booking_id": booking.id})
        notify(booking.traveler, "traveler", "captain_changed", f"Your Captain for {booking.code} is now {new_captain.name}",
               "Same trip and price, arranged by their agency.", {"booking_id": booking.id})
    return booking


def pass_on_decline(booking, user) -> bool:
    """A Captain declined an agency request: hand it to the best free colleague. False if nobody is free."""
    for captain in candidates(booking):
        try:
            reassign(booking, captain, user, "captain")
        except Exception:  # noqa: BLE001 — someone else took that day meanwhile; try the next
            continue
        booking.refresh_from_db()
        notify(booking.agency.owner, "agency", "booking_passed_on", f"{booking.code} passed to {captain.name}",
               "The first Captain declined, so a free colleague got the request.", {"booking_id": booking.id})
        return True
    return False


def submit(agency: Agency) -> Agency:
    check = checklist(agency)
    if not check["can_submit"]:
        missing = [i["label"] for i in check["items"] if not i["done"] and i["key"] != "approved"]
        raise bad_request("Finish these first: " + "; ".join(missing) if missing else "Already submitted.", "incomplete")
    agency.review_status = Agency.ReviewStatus.PENDING
    agency.submitted_at = timezone.now()
    agency.review_note = ""
    agency.save(update_fields=["review_status", "submitted_at", "review_note", "updated_at"])
    notify_admins("agency_submitted", f"New agency to verify · {agency.code}", f"{agency.name} · {agency.city.name}", {"agency_id": agency.id})
    return agency
