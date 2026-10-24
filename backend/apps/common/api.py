"""
Small shared building blocks for every app's API views.
"""
import math

from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import CursorPagination, PageNumberPagination
from rest_framework.permissions import BasePermission

from apps.accounts.exceptions import APIError
from apps.accounts.tokens import session_role


def role_of(request) -> str | None:
    return session_role(request)


class IsTravelerOrCaptain(BasePermission):
    """Signed in through the Traveler or Captain app (views branch on `role_of`)."""

    message = "This account can't do that from this app."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and role_of(request) in {"traveler", "captain"})


def require_role(request, *roles):
    if role_of(request) not in roles:
        raise PermissionDenied("This account can't do that from this app.")


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 50


class NewestFirstCursor(CursorPagination):
    """Stable infinite scroll for feeds and long lists (no duplicated rows when new items arrive)."""

    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 30
    ordering = "-created_at"


def conflict(detail: str, code: str = "conflict"):
    return APIError(detail, code, status_code=409)


def bad_request(detail: str, code: str = "invalid"):
    return APIError(detail, code, status_code=400)


def public_url(request, path: str) -> str:
    """Absolute link for pages opened outside the API client (checkout, trip share)."""
    from django.conf import settings

    if settings.PUBLIC_BASE_URL:
        return settings.PUBLIC_BASE_URL + path
    return request.build_absolute_uri(path) if request else path


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    lat1, lng1, lat2, lng2 = map(lambda v: math.radians(float(v)), (lat1, lng1, lat2, lng2))
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))
