from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import RequestOTPSerializer, UserSerializer, VerifyOTPSerializer

# Step 1 only: OTP is a fixed code, no SMS provider wired up yet.
# Swap this out for Twilio Verify (or similar) once auth is confirmed solid
# across all five frontends — see the earlier full-spec scaffold for that.
STATIC_OTP = "123456"


class RequestOTPView(APIView):
    """POST /api/v1/auth/otp/request/  { "phone_number": "9876543210" }"""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        print(f"[DEV] Static OTP for {serializer.validated_data['phone_number']}: {STATIC_OTP}")
        return Response({"detail": "OTP sent (static, dev mode)."})


class VerifyOTPView(APIView):
    """
    POST /api/v1/auth/otp/verify/  { "phone_number", "code", "role", "full_name" }

    `role` is which app/mode the person is entering this session — always
    trusted from the request and written to the user record, so the same
    phone number can log into the Traveler app one day and the Captain app
    the next without getting stuck on whichever role they signed up under.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["code"] != STATIC_OTP:
            return Response({"detail": "Invalid code."}, status=status.HTTP_400_BAD_REQUEST)

        phone_number = data["phone_number"]
        try:
            user = User.objects.get(phone_number=phone_number)
            created = False
        except User.DoesNotExist:
            user = User.objects.create(
                phone_number=phone_number,
                full_name=data.get("full_name", ""),
                role=data["role"],
                phone_verified=True,
            )
            created = True

        if not created:
            update_fields = []
            if not user.phone_verified:
                user.phone_verified = True
                update_fields.append("phone_verified")
            if user.role != data["role"]:
                user.role = data["role"]
                update_fields.append("role")
            if update_fields:
                user.save(update_fields=update_fields)

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
