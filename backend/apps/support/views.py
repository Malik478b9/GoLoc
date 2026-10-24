from rest_framework import generics, serializers

from apps.bookings.models import Booking
from apps.common.api import IsTravelerOrCaptain, role_of
from apps.common.models import next_public_code
from apps.notifications.service import notify_admins

from .models import Ticket


class TicketSerializer(serializers.ModelSerializer):
    booking_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    booking_code = serializers.CharField(source="booking.code", read_only=True, default=None)

    class Meta:
        model = Ticket
        fields = ["id", "code", "category", "subject", "description", "status", "resolution", "refund_amount",
                  "booking_id", "booking_code", "created_at", "resolved_at"]
        read_only_fields = ["id", "code", "status", "resolution", "refund_amount", "resolved_at", "created_at"]


class TicketListView(generics.ListCreateAPIView):
    """GET my tickets · POST {category, subject, description, booking_id?}"""

    permission_classes = [IsTravelerOrCaptain]
    serializer_class = TicketSerializer

    def get_queryset(self):
        return Ticket.objects.filter(raised_by=self.request.user, role=role_of(self.request)).select_related("booking")

    def perform_create(self, serializer):
        role = role_of(self.request)
        booking = None
        booking_id = serializer.validated_data.pop("booking_id", None)
        if booking_id:
            field = "traveler" if role == "traveler" else "captain__user"
            booking = Booking.objects.filter(**{"pk": booking_id, field: self.request.user}).first()
            if booking is None:
                raise serializers.ValidationError({"booking_id": "That booking isn't yours."})
        ticket = serializer.save(code=next_public_code("TKT"), raised_by=self.request.user, role=role, booking=booking)
        urgent = "🚨 " if ticket.category == Ticket.Category.SAFETY else ""
        notify_admins("ticket_opened", f"{urgent}{ticket.code} · {ticket.get_category_display()}",
                      f"{ticket.subject}{' · ' + booking.code if booking else ''}", {"ticket_id": ticket.id})
