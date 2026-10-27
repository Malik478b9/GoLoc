from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import OTPChallenge, User
from apps.accounts.otp.providers import OTPDeliveryError
from apps.accounts.phone import InvalidPhoneNumber, normalize_phone
from apps.cities.models import City

OTP_SETTINGS = dict(
    OTP_PROVIDER="console",
    OTP_DEV_FIXED_CODE="",
    OTP_EXPOSE_CODE_IN_RESPONSE=True,
    OTP_RESEND_COOLDOWN_SECONDS=30,
    OTP_MAX_SENDS_PER_HOUR=5,
    OTP_MAX_ATTEMPTS=5,
    OTP_TTL_SECONDS=300,
)

REQUEST = "/api/v1/auth/otp/request/"
VERIFY = "/api/v1/auth/otp/verify/"
REFRESH = "/api/v1/auth/token/refresh/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/auth/me/"


class PhoneNormalizationTests(TestCase):
    def test_accepts_common_indian_formats(self):
        for raw in ["9876543210", "09876543210", "919876543210", "+91 98765-43210", "98765 43210", "0091 9876543210"]:
            self.assertEqual(normalize_phone(raw), "+919876543210", raw)

    def test_accepts_international_with_plus(self):
        self.assertEqual(normalize_phone("+14155550123"), "+14155550123")

    def test_rejects_bad_numbers(self):
        for raw in ["", "12345", "98765abc10", "1234567890", "+91123", "987654321012345678"]:
            with self.assertRaises(InvalidPhoneNumber, msg=raw):
                normalize_phone(raw)


@override_settings(**OTP_SETTINGS)
class OTPFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def _request(self, phone="9876543210", **extra):
        return self.client.post(REQUEST, {"phone_number": phone, **extra}, format="json")

    def _verify(self, code, phone="9876543210", role="traveler", **extra):
        extra.setdefault("full_name", "Test Traveler")
        return self.client.post(VERIFY, {"phone_number": phone, "code": code, "role": role, **extra}, format="json")

    def _age_latest(self, seconds):
        c = OTPChallenge.objects.first()
        OTPChallenge.objects.filter(pk=c.pk).update(created_at=c.created_at - timedelta(seconds=seconds))

    # ---- happy path ------------------------------------------------------
    def test_signup_creates_traveler_with_normalized_phone(self):
        res = self._request()
        self.assertEqual(res.status_code, 200)
        code = res.data["dev_code"]
        self.assertEqual(len(code), 6)
        self.assertEqual(res.data["phone_number"], "+919876543210")

        res = self._verify(code, full_name="Asha Rao")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["created"])
        self.assertEqual(res.data["user"]["phone_number"], "+919876543210")
        self.assertEqual(res.data["user"]["role"], "traveler")
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        user = User.objects.get()
        self.assertEqual(user.full_name, "Asha Rao")
        self.assertTrue(user.phone_verified)
        self.assertFalse(user.has_usable_password())

    def test_code_is_stored_hashed_not_plain(self):
        code = self._request().data["dev_code"]
        challenge = OTPChallenge.objects.get()
        self.assertNotIn(code, challenge.code_hash)
        self.assertEqual(len(challenge.code_hash), 64)

    def test_same_number_different_formats_is_one_account(self):
        code = self._request("9876543210").data["dev_code"]
        self._verify(code, phone="9876543210")
        self._age_latest(60)
        code = self._request("+91 98765 43210").data["dev_code"]
        res = self._verify(code, phone="098765 43210", role="captain")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["created"])
        self.assertEqual(User.objects.count(), 1)

    # ---- wrong / reused / expired codes ---------------------------------
    def test_wrong_code_rejected(self):
        code = self._request().data["dev_code"]
        wrong = "000000" if code != "000000" else "111111"
        res = self._verify(wrong)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "otp_invalid")
        self.assertEqual(OTPChallenge.objects.get().attempts, 1)  # attempt was counted, not rolled back

    def test_code_works_only_once(self):
        code = self._request().data["dev_code"]
        self.assertEqual(self._verify(code).status_code, 200)
        res = self._verify(code)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "otp_invalid")

    def test_expired_code_rejected(self):
        code = self._request().data["dev_code"]
        OTPChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self._verify(code).data["code"], "otp_invalid")

    def test_new_code_invalidates_previous(self):
        first = self._request().data["dev_code"]
        self._age_latest(60)
        second = self._request().data["dev_code"]
        if first != second:
            self.assertEqual(self._verify(first).status_code, 400)
        self.assertEqual(self._verify(second).status_code, 200)

    def test_lockout_after_max_wrong_attempts(self):
        code = self._request().data["dev_code"]
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(4):
            self.assertEqual(self._verify(wrong).data["code"], "otp_invalid")
        self.assertEqual(self._verify(wrong).data["code"], "otp_locked")
        # even the right code is refused now — they must request a new one
        self.assertEqual(self._verify(code).data["code"], "otp_locked")

    # ---- rate limits -----------------------------------------------------
    def test_resend_cooldown(self):
        self._request()
        res = self._request()
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.data["code"], "otp_cooldown")
        self.assertGreater(res.data["retry_after"], 0)
        self.assertIn("Retry-After", res)

    def test_hourly_cap_per_phone(self):
        for _ in range(5):
            self.assertEqual(self._request().status_code, 200)
            self._age_latest(60)
        res = self._request()
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.data["code"], "otp_rate_limited")

    def test_cap_is_per_phone(self):
        self._request("9876543210")
        self.assertEqual(self._request("9876543211").status_code, 200)

    # ---- provider failures -----------------------------------------------
    def test_sms_failure_returns_503_and_does_not_burn_limit(self):
        with mock.patch("apps.accounts.otp.providers.ConsoleProvider.send", side_effect=OTPDeliveryError("down")):
            res = self._request()
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.data["code"], "otp_delivery_failed")
        self.assertEqual(OTPChallenge.objects.count(), 0)
        self.assertEqual(self._request().status_code, 200)  # no cooldown from the failed attempt

    @override_settings(OTP_EXPOSE_CODE_IN_RESPONSE=False)
    def test_code_not_exposed_when_disabled(self):
        self.assertNotIn("dev_code", self._request().data)

    # ---- validation ------------------------------------------------------
    def test_invalid_phone_gives_field_error(self):
        res = self._request("12345")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "validation_error")
        self.assertIn("phone_number", res.data["fields"])

    # ---- roles -----------------------------------------------------------
    def test_cannot_self_signup_as_admin(self):
        res = self._request(role="admin")
        self.assertEqual(res.status_code, 200)        # looks the same as a real send…
        self.assertNotIn("dev_code", res.data)          # …but nothing was sent
        self.assertEqual(OTPChallenge.objects.get().provider, "suppressed")
        res = self._verify("123456", role="admin")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_existing_non_staff_user_cannot_enter_admin(self):
        code = self._request().data["dev_code"]
        self._verify(code)
        self._age_latest(60)
        # Even with a valid traveler code, choosing role=admin is refused
        code = self._request(role="traveler").data["dev_code"]
        res = self._verify(code, role="admin")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["code"], "not_admin")

    def test_staff_can_sign_in_as_admin(self):
        call_command("create_admin", "9876543210", name="Ops", stdout=mock.MagicMock())
        code = self._request(role="admin").data["dev_code"]
        res = self._verify(code, role="admin")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["user"]["role"], "admin")
        self.assertTrue(res.data["user"]["is_admin"])

    def test_disabled_account_refused(self):
        User.objects.create_user("9876543210", is_active=False)
        code = self._request().data["dev_code"]
        res = self._verify(code)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["code"], "account_disabled")

    # ---- sign in vs create account ---------------------------------------
    def test_signup_needs_a_name_and_keeps_the_code_usable(self):
        code = self._request(intent="signup").data["dev_code"]
        res = self._verify(code, full_name="")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "name_required")
        self.assertFalse(User.objects.exists())
        res = self._verify(code, full_name="Asha Rao")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["created"])

    def test_signin_with_unknown_number_sends_no_code(self):
        res = self._request(intent="signin")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data["code"], "account_not_found")
        self.assertFalse(OTPChallenge.objects.exists())

    def test_signin_needs_only_number_and_code(self):
        User.objects.create_user("9876543210", full_name="Asha Rao")
        res = self._request(intent="signin")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["is_new"])
        res = self.client.post(VERIFY, {"phone_number": "9876543210", "code": res.data["dev_code"], "role": "captain"},
                               format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["created"])
        self.assertEqual(res.data["user"]["full_name"], "Asha Rao")

    def test_signup_reports_new_number(self):
        self.assertTrue(self._request(intent="signup").data["is_new"])

    def test_role_lives_in_token_so_two_apps_can_be_open_at_once(self):
        code = self._request().data["dev_code"]
        traveler_access = self._verify(code, role="traveler").data["access"]
        self._age_latest(60)
        code = self._request().data["dev_code"]
        captain_access = self._verify(code, role="captain").data["access"]

        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {traveler_access}")
        self.assertEqual(c.get(ME).data["role"], "traveler")
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {captain_access}")
        self.assertEqual(c.get(ME).data["role"], "captain")


@override_settings(**OTP_SETTINGS)
class SessionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        code = self.client.post(REQUEST, {"phone_number": "9876543210"}, format="json").data["dev_code"]
        res = self.client.post(VERIFY, {"phone_number": "9876543210", "code": code, "role": "captain",
                                         "full_name": "Dev"}, format="json")
        self.access, self.refresh = res.data["access"], res.data["refresh"]
        self.user = User.objects.get()

    def auth(self, token=None):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {token or self.access}")
        return c

    def test_me_requires_auth(self):
        self.assertEqual(APIClient().get(ME).status_code, 401)

    def test_refresh_rotates_and_keeps_role(self):
        res = self.client.post(REFRESH, {"refresh": self.refresh}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertNotEqual(res.data["refresh"], self.refresh)
        self.assertEqual(self.auth(res.data["access"]).get(ME).data["role"], "captain")
        # old refresh token is now revoked
        self.assertEqual(self.client.post(REFRESH, {"refresh": self.refresh}, format="json").status_code, 401)

    def test_logout_revokes_refresh(self):
        self.assertEqual(self.client.post(LOGOUT, {"refresh": self.refresh}, format="json").status_code, 204)
        self.assertEqual(self.client.post(REFRESH, {"refresh": self.refresh}, format="json").status_code, 401)
        # idempotent
        self.assertEqual(self.client.post(LOGOUT, {"refresh": self.refresh}, format="json").status_code, 204)

    def test_refresh_refused_for_disabled_account(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.client.post(REFRESH, {"refresh": self.refresh}, format="json").status_code, 401)

    def test_disabled_account_access_token_stops_working(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.auth().get(ME).status_code, 401)

    def test_update_profile_and_city(self):
        jaipur = City.objects.get(slug="jaipur")
        res = self.auth().patch(ME, {"full_name": "  Dev Singh ", "city_id": str(jaipur.id)}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["full_name"], "Dev Singh")
        self.assertEqual(res.data["city"]["name"], "Jaipur")

    def test_cannot_pick_city_that_is_not_live(self):
        hidden = City.objects.create(name="Leh", slug="leh", is_live=False)
        res = self.auth().patch(ME, {"city_id": str(hidden.id)}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("city_id", res.data["fields"])

    def test_cannot_change_phone_or_role_via_me(self):
        self.auth().patch(ME, {"phone_number": "+919999999999", "role": "admin", "is_staff": True}, format="json")
        self.user.refresh_from_db()
        self.assertEqual(self.user.phone_number, "+919876543210")
        self.assertFalse(self.user.is_staff)


class RolePermissionTests(TestCase):
    """The permission classes every future endpoint will use."""

    def _request_with(self, role, is_staff=False):
        from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: F401
        from rest_framework_simplejwt.tokens import AccessToken

        user = User.objects.create_user(f"98765432{User.objects.count():02d}", is_staff=is_staff)
        token = AccessToken.for_user(user)
        token["role"] = role
        request = mock.MagicMock(user=user, auth=token)
        return request

    def test_role_gates(self):
        from apps.accounts.permissions import IsAdmin, IsCaptain, IsTraveler

        t = self._request_with("traveler")
        c = self._request_with("captain")
        a = self._request_with("admin", is_staff=True)
        fake_admin = self._request_with("admin", is_staff=False)

        self.assertTrue(IsTraveler().has_permission(t, None))
        self.assertFalse(IsCaptain().has_permission(t, None))
        self.assertTrue(IsCaptain().has_permission(c, None))
        self.assertFalse(IsTraveler().has_permission(c, None))
        self.assertTrue(IsAdmin().has_permission(a, None))
        self.assertFalse(IsAdmin().has_permission(fake_admin, None))


class HealthTests(TestCase):
    def test_health(self):
        res = APIClient().get("/api/v1/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")
