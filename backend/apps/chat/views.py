import re

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import Booking
from apps.captains.models import CaptainProfile
from apps.common.api import IsTravelerOrCaptain, bad_request, role_of
from apps.notifications.service import notify

from .models import Conversation, Message

# Before a paid booking exists, phone numbers / emails are masked so deals
# stay on-platform (where insurance and SOS protect both sides).
CONTACT_RE = re.compile(r"(\+?\d[\d\s-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)")


def _avatar(request, captain):
    return request.build_absolute_uri(captain.avatar.url) if captain.avatar else None


class ConversationSerializer(serializers.ModelSerializer):
    other = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()
    booking_code = serializers.CharField(source="booking.code", default=None)

    class Meta:
        model = Conversation
        fields = ["id", "other", "unread", "booking_code", "last_message_at", "last_message_preview"]

    def get_other(self, obj):
        if self.context["role"] == "traveler":
            return {"name": obj.captain.name, "code": obj.captain.code, "avatar": _avatar(self.context["request"], obj.captain),
                    "captain_id": obj.captain_id}
        return {"name": obj.traveler.full_name or "Traveler", "code": None, "avatar": None}

    def get_unread(self, obj):
        return obj.traveler_unread if self.context["role"] == "traveler" else obj.captain_unread


class MessageSerializer(serializers.ModelSerializer):
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "body", "sender_role", "mine", "created_at"]

    def get_mine(self, obj):
        return obj.sender_id == self.context["user_id"]


def _conversations(request):
    qs = Conversation.objects.select_related("captain__user", "traveler", "booking")
    if role_of(request) == "traveler":
        return qs.filter(traveler=request.user)
    return qs.filter(captain__user=request.user)


class ConversationListView(generics.ListAPIView):
    """GET conversations · POST {captain_id} (traveler) or {booking_id} (either side) → open thread."""

    permission_classes = [IsTravelerOrCaptain]
    serializer_class = ConversationSerializer

    def get_queryset(self):
        return _conversations(self.request).filter(last_message_at__isnull=False).order_by("-last_message_at")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "role": role_of(self.request)}

    def post(self, request):
        role = role_of(request)
        booking = None
        if request.data.get("booking_id"):
            field = "traveler" if role == "traveler" else "captain__user"
            booking = Booking.objects.filter(**{"pk": request.data["booking_id"], field: request.user}).select_related("captain").first()
            if not booking:
                raise Http404
            captain, traveler = booking.captain, booking.traveler
        elif role == "traveler":
            captain = get_object_or_404(CaptainProfile, pk=request.data.get("captain_id"), review_status="approved")
            traveler = request.user
        else:
            raise bad_request("Captains can message travelers from a booking.", "booking_required")
        if captain.user_id == traveler.id:
            raise bad_request("You can't message yourself.", "self_message")
        try:
            convo, _ = Conversation.objects.get_or_create(traveler=traveler, captain=captain, defaults={"booking": booking})
        except IntegrityError:
            convo = Conversation.objects.get(traveler=traveler, captain=captain)
        if booking and convo.booking_id != booking.id:
            convo.booking = booking
            convo.save(update_fields=["booking"])
        return Response(ConversationSerializer(convo, context={"request": request, "role": role}).data, status=status.HTTP_201_CREATED)


class MessagesView(APIView):
    """
    GET  /chat/<id>/messages/?after=<msg id>   newest 50, or only newer than `after` (polling)
         /chat/<id>/messages/?before=<msg id>  older page
    POST /chat/<id>/messages/ {body}
    """

    permission_classes = [IsTravelerOrCaptain]

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "chat"
        return super().get_throttles()

    def get(self, request, pk):
        convo = get_object_or_404(_conversations(request), pk=pk)
        role = role_of(request)
        qs = convo.messages.all()
        after, before = request.query_params.get("after"), request.query_params.get("before")
        if after and after.isdigit():
            rows = list(qs.filter(id__gt=int(after)).order_by("id")[:100])
        else:
            if before and before.isdigit():
                qs = qs.filter(id__lt=int(before))
            rows = list(qs.order_by("-id")[:50])[::-1]
        unread_field = "traveler_unread" if role == "traveler" else "captain_unread"
        if getattr(convo, unread_field):
            Conversation.objects.filter(pk=convo.pk).update(**{unread_field: 0})
        return Response({
            "conversation": ConversationSerializer(convo, context={"request": request, "role": role}).data,
            "messages": MessageSerializer(rows, many=True, context={"user_id": request.user.id}).data,
        })

    def post(self, request, pk):
        convo = get_object_or_404(_conversations(request), pk=pk)
        role = role_of(request)
        body = str(request.data.get("body", "")).strip()
        if not body:
            raise bad_request("Type a message.", "empty")
        body = body[:2000]
        paid = Booking.objects.filter(traveler_id=convo.traveler_id, captain_id=convo.captain_id, status__in=Booking.PAID).exists()
        if not paid:
            body = CONTACT_RE.sub("•••• (shared after booking)", body)
        with transaction.atomic():
            msg = Message.objects.create(conversation=convo, sender=request.user, sender_role=role, body=body)
            other_unread = "captain_unread" if role == "traveler" else "traveler_unread"
            Conversation.objects.filter(pk=convo.pk).update(
                last_message_at=timezone.now(), last_message_preview=body[:120], **{other_unread: F(other_unread) + 1})
        # One ping per conversation every 2 minutes — a burst of messages shouldn't buzz the phone 10 times.
        if cache.add(f"chatping:{convo.pk}:{role}", 1, 120):
            if role == "traveler":
                notify(convo.captain.user, "captain", "chat_message", request.user.full_name or "Traveler", body[:140], {"conversation_id": convo.id})
            else:
                notify(convo.traveler, "traveler", "chat_message", convo.captain.name, body[:140], {"conversation_id": convo.id})
        return Response(MessageSerializer(msg, context={"user_id": request.user.id}).data, status=status.HTTP_201_CREATED)
