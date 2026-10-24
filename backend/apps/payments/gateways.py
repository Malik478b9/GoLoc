"""
Payment gateways behind one interface. Pick with PAYMENT_GATEWAY:

  fake      development / staging. Same order → pay → signature → refund flow as
            Razorpay, so switching is an env-var change. Never moves money.
  razorpay  Razorpay Orders API (test keys rzp_test_… or live keys).

Signature check is identical for both: HMAC-SHA256(secret, "order_id|payment_id").
"""
import hashlib
import hmac
import secrets

import requests
from django.conf import settings


class GatewayError(Exception):
    pass


class BaseGateway:
    name = ""

    @property
    def key_id(self) -> str:
        return ""

    @property
    def secret(self) -> str:
        raise NotImplementedError

    def create_order(self, amount_rupees: int, receipt: str, notes: dict) -> str:
        raise NotImplementedError

    def refund(self, payment_id: str, amount_rupees: int, notes: dict) -> str:
        raise NotImplementedError

    def signature(self, order_id: str, payment_id: str) -> str:
        return hmac.new(self.secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()

    def verify_payment(self, order_id: str, payment_id: str, signature: str) -> bool:
        return hmac.compare_digest(self.signature(order_id, payment_id), signature or "")

    def verify_webhook(self, body: bytes, signature: str) -> bool:
        secret = settings.RAZORPAY_WEBHOOK_SECRET
        if not secret:
            return False
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature or "")


class FakeGateway(BaseGateway):
    name = "fake"

    @property
    def secret(self):
        return settings.SECRET_KEY

    def create_order(self, amount_rupees, receipt, notes):
        return f"order_fake_{secrets.token_hex(8)}"

    def new_payment_id(self):
        return f"pay_fake_{secrets.token_hex(8)}"

    def refund(self, payment_id, amount_rupees, notes):
        return f"rfnd_fake_{secrets.token_hex(8)}"


class RazorpayGateway(BaseGateway):
    name = "razorpay"
    base = "https://api.razorpay.com/v1"

    @property
    def key_id(self):
        return settings.RAZORPAY_KEY_ID

    @property
    def secret(self):
        return settings.RAZORPAY_KEY_SECRET

    def _post(self, path, payload):
        try:
            resp = requests.post(f"{self.base}{path}", json=payload, auth=(self.key_id, self.secret), timeout=15)
        except requests.RequestException as exc:
            raise GatewayError("Payment provider unreachable.") from exc
        if resp.status_code >= 400:
            try:
                message = resp.json().get("error", {}).get("description", "")
            except ValueError:
                message = ""
            raise GatewayError(message or f"Payment provider error ({resp.status_code}).")
        return resp.json()

    def create_order(self, amount_rupees, receipt, notes):
        data = self._post("/orders", {"amount": amount_rupees * 100, "currency": "INR", "receipt": receipt, "notes": notes})
        return data["id"]

    def refund(self, payment_id, amount_rupees, notes):
        data = self._post(f"/payments/{payment_id}/refund", {"amount": amount_rupees * 100, "notes": notes, "speed": "normal"})
        return data["id"]


def get_gateway(name: str | None = None) -> BaseGateway:
    name = name or settings.PAYMENT_GATEWAY
    if name == "razorpay":
        return RazorpayGateway()
    if name == "fake":
        return FakeGateway()
    raise GatewayError(f"Unknown payment gateway {name!r}")
