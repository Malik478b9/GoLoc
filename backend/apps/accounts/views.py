from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OTPRequest, User
from .serializers import RequestOTPSerializer, UserSerializer, VerifyOTPSerializer
from .services import twilio_verify


class RequestOTPView(APIView):
    """POST /api/v1/auth/otp/request/ — sends an OTP via Twilio Verify."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone_number = serializer.validated_data["phone_number"]
        purpose = serializer.validated_data["purpose"]

        sid = twilio_verify.start_verification(phone_number)
        OTPRequest.objects.create(phone_number=phone_number, purpose=purpose, twilio_sid=sid)

        return Response({"detail": "OTP sent."}, status=status.HTTP_200_OK)


class VerifyOTPView(APIView):
    """
    POST /api/v1/auth/otp/verify/ — verifies the OTP and returns JWT tokens.
    Creates the User record on first successful verification (signup).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        print(f"[DEV] OTP verify request: {data}")
        phone_number = data["phone_number"]

        approved = twilio_verify.check_verification(phone_number, data["code"])
        if not approved:
            return Response({"detail": "Invalid or expired code."}, status=status.HTTP_400_BAD_REQUEST)

        OTPRequest.objects.filter(
            phone_number=phone_number, status=OTPRequest.Status.PENDING
        ).update(status=OTPRequest.Status.VERIFIED, verified_at=timezone.now())

        user, created = User.objects.get_or_create(
            phone_number=phone_number,
            defaults={
                "role": data.get("role", User.Role.TRAVELER),
                "full_name": data.get("full_name", ""),
                "primary_city_id": data.get("primary_city_id"),
                "phone_verified": True,
            },
        )
        if not created and not user.phone_verified:
            user.phone_verified = True
            user.save(update_fields=["phone_verified"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "created": created,
                "user": UserSerializer(user).data,
            }
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
