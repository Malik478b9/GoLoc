import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .exceptions import error_response
from .otp.service import DeliveryFailed, OTPError, ResendCooldown, TooManyRequests, request_otp, verify_otp
from .phone import mask_phone
from .models import TravelerProfile
from .serializers import (LogoutSerializer, RequestOTPSerializer, TravelerProfileSerializer, UserSerializer,
                          VerifyOTPSerializer)
from .throttles import OTPRequestThrottle, OTPVerifyThrottle
from .tokens import ROLE_CLAIM, issue_tokens

User = get_user_model()
logger = logging.getLogger("goloc.auth")


def _client_ip(request) -> str | None:
    # Behind a proxy/load balancer, configure it to set X-Forwarded-For.
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR")


def _otp_error_response(exc: OTPError) -> Response:
    if isinstance(exc, (ResendCooldown, TooManyRequests)):
        http = status.HTTP_429_TOO_MANY_REQUESTS
    elif isinstance(exc, DeliveryFailed):
        http = status.HTTP_503_SERVICE_UNAVAILABLE
    else:
        http = status.HTTP_400_BAD_REQUEST
    return error_response(exc.message, exc.code, http, retry_after=exc.retry_after)


def _is_admin_number(phone_number: str) -> bool:
    return User.objects.filter(phone_number=phone_number, is_staff=True, is_active=True).exists()


class RequestOTPView(APIView):
    """
    POST /api/v1/auth/otp/request/   {"phone_number": "9876543210", "role": "traveler"}

    200 {"detail", "phone_number", "expires_in", "resend_in"[, "dev_code"]}
    429 {"code": "otp_cooldown" | "otp_rate_limited", "retry_after"}
    503 {"code": "otp_delivery_failed"}
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone_number"]
        role = serializer.validated_data.get("role")

        # Admin console: only real admins get an SMS. Everyone else gets the
        # same-looking response so the endpoint can't be used to discover
        # which numbers are admins.
        deliver = role != User.Role.ADMIN or _is_admin_number(phone)

        try:
            sent = request_otp(phone, ip=_client_ip(request), deliver=deliver)
        except OTPError as exc:
            return _otp_error_response(exc)

        body = {
            "detail": "We've sent a 6-digit code by SMS.",
            "phone_number": phone,
            "expires_in": sent.expires_in,
            "resend_in": sent.resend_in,
        }
        if sent.dev_code:
            body["dev_code"] = sent.dev_code  # DEBUG builds only
        return Response(body)


class VerifyOTPView(APIView):
    """
    POST /api/v1/auth/otp/verify/
         {"phone_number", "code", "role": "traveler"|"captain"|"admin", "full_name"?}

    Signs in, creating the account on first use for traveler/captain.
    Admin accounts are never created here — see `manage.py create_admin`.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        phone, role = data["phone_number"], data["role"]

        try:
            verify_otp(phone, data["code"])
        except OTPError as exc:
            return _otp_error_response(exc)

        user = User.objects.filter(phone_number=phone).first()
        created = False

        if role == User.Role.ADMIN:
            if not (user and user.is_staff and user.is_active):
                logger.warning("Admin sign-in refused for %s", mask_phone(phone))
                return error_response("This number doesn't have admin access.", "not_admin",
                                      status.HTTP_403_FORBIDDEN)
        elif user is None:
            try:
                with transaction.atomic():
                    user = User.objects.create_user(
                        phone_number=phone, full_name=data.get("full_name", ""), role=role, phone_verified=True
                    )
                    created = True
            except IntegrityError:  # two devices signing up the same number at the same instant
                user = User.objects.get(phone_number=phone)

        if not user.is_active:
            return error_response("This account has been disabled. Contact GoLoc support.", "account_disabled",
                                  status.HTTP_403_FORBIDDEN)

        update_fields = ["last_login"]
        user.last_login = timezone.now()
        if not user.phone_verified:
            user.phone_verified = True
            update_fields.append("phone_verified")
        if user.role != role:
            user.role = role
            update_fields.append("role")
        if not created and not user.full_name and data.get("full_name"):
            user.full_name = data["full_name"]
            update_fields.append("full_name")
        user.save(update_fields=update_fields)

        logger.info("Signed in %s as %s%s", mask_phone(phone), role, " (new account)" if created else "")
        return Response(
            {
                **issue_tokens(user, role),
                "created": created,
                "user": UserSerializer(user, context={"role": role}).data,
            }
        )


class SessionRefreshSerializer(TokenRefreshSerializer):
    """Refresh, but refuse if the account was disabled or lost admin access since sign-in."""

    def validate(self, attrs):
        try:
            token = RefreshToken(attrs["refresh"])
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc
        user = User.objects.filter(pk=token.get("user_id")).first()
        if user is None or not user.is_active:
            raise InvalidToken("Account is no longer active.")
        if token.get(ROLE_CLAIM) == User.Role.ADMIN and not user.is_staff:
            raise InvalidToken("Admin access has been removed.")
        return super().validate(attrs)


class RefreshView(TokenRefreshView):
    """POST /api/v1/auth/token/refresh/  {"refresh"} -> {"access", "refresh"} (the old refresh stops working)."""

    serializer_class = SessionRefreshSerializer


class LogoutView(APIView):
    """POST /api/v1/auth/logout/  {"refresh"} — revokes the refresh token. Idempotent."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            pass  # already expired/revoked — the outcome the caller wanted
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET / PATCH /api/v1/auth/me/   PATCH accepts full_name, email, city_id."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class TravelerProfileView(APIView):
    """GET / PUT /api/v1/auth/traveler-profile/ — SOS emergency contact and trip preferences."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = TravelerProfile.objects.get_or_create(user=request.user)
        return Response(TravelerProfileSerializer(profile).data)

    def put(self, request):
        profile, _ = TravelerProfile.objects.get_or_create(user=request.user)
        serializer = TravelerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
