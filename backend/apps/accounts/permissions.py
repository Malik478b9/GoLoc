"""
Role gates for every API view from here on. Use these instead of
IsAuthenticated so a Traveler token can't call Captain endpoints and so on:

    permission_classes = [IsCaptain]
"""
from rest_framework.permissions import BasePermission

from .models import User
from .tokens import session_role


class _RolePermission(BasePermission):
    role: str = ""
    message = "This account can't do that from this app."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and session_role(request) == self.role)


class IsTraveler(_RolePermission):
    role = User.Role.TRAVELER


class IsCaptain(_RolePermission):
    role = User.Role.CAPTAIN


class IsAdmin(_RolePermission):
    """Admin console session *and* still staff — revoking is_staff cuts access immediately."""

    role = User.Role.ADMIN

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.is_staff
