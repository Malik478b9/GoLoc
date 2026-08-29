from rest_framework import permissions, viewsets

from .models import Conversation
from .serializers import ConversationSerializer


class ConversationViewSet(viewsets.ReadOnlyModelViewSet):
    """REST fallback for chat history load (initial screen paint before
    the WebSocket connects) — 'Conversations' list on both apps."""

    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == user.Role.CAPTAIN:
            return Conversation.objects.filter(booking__captain__user=user)
        return Conversation.objects.filter(booking__traveler=user)
