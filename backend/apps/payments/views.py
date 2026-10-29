"""
Mobile checkout flow (works in Expo Go — no native SDK needed):

  1. app   POST /payments/bookings/<ref>/order/        → {checkout_url}
  2. app   opens checkout_url in a WebView
  3. page  Razorpay Checkout (or the fake test page) → POST /payments/verify/
  4. page  redirects to /pay/result/?status=success|failed|cancelled — the app
           watches for that URL, closes the WebView and refetches the booking.
  5. Razorpay also calls /payments/webhooks/razorpay/ — capture is idempotent,
     so the booking is confirmed even if the phone dies mid-checkout.
"""
import json
import logging

from django.conf import settings
from django.core import signing
from django.db.models import Sum
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.html import escape
from rest_framework import generics, serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCaptain, IsTraveler
from apps.bookings.views import get_booking
from apps.captains.views import my_profile
from apps.common.api import public_url

from . import services
from .gateways import FakeGateway, get_gateway
from .models import LedgerEntry, Payment, Payout, WebhookEvent

logger = logging.getLogger("goloc.payments")
SALT = "goloc.checkout"


def _token(payment):
    return signing.dumps({"p": str(payment.pk)}, salt=SALT)


def _payment_from_token(token) -> Payment:
    try:
        data = signing.loads(token, salt=SALT, max_age=settings.PAYMENT_WINDOW_MINUTES * 60 + 900)
    except signing.BadSignature as exc:
        raise Http404 from exc
    return get_object_or_404(Payment.objects.select_related("booking__captain__user", "booking__traveler"), pk=data["p"])


class CreateOrderView(APIView):
    permission_classes = [IsTraveler]

    def post(self, request, ref):
        booking = get_booking(request, ref)
        payment = services.create_order(booking)
        return Response({
            "payment_id": payment.id, "order_id": payment.order_id, "amount": payment.amount, "gateway": payment.gateway,
            "key_id": get_gateway(payment.gateway).key_id,
            "checkout_url": public_url(request, f"/pay/checkout/{_token(payment)}/"),
            "result_path": "/pay/result/",
        }, status=status.HTTP_201_CREATED)


class VerifyView(APIView):
    """Called by the checkout page. Authorised by the signed checkout token, not a JWT."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payment = _payment_from_token(str(request.data.get("token", "")))
        if request.data.get("outcome") == "failed":
            services.mark_failed(payment, str(request.data.get("reason", "Payment failed"))[:300])
            return Response({"status": "failed"})
        if payment.gateway == "fake":
            gw = FakeGateway()
            pid = gw.new_payment_id()
            services.capture(payment, pid, gw.signature(payment.order_id, pid), "test")
        else:
            if request.data.get("razorpay_order_id") != payment.order_id:
                return Response({"detail": "Order mismatch.", "code": "order_mismatch"}, status=400)
            services.capture(payment, str(request.data.get("razorpay_payment_id", "")),
                             str(request.data.get("razorpay_signature", "")))
        payment.refresh_from_db()
        return Response({"status": payment.status, "booking_status": payment.booking.status})


class RazorpayWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        body = request.body
        if not get_gateway("razorpay").verify_webhook(body, request.headers.get("X-Razorpay-Signature", "")):
            return Response(status=400)
        event_id = request.headers.get("X-Razorpay-Event-Id", "")
        if event_id:
            _, created = WebhookEvent.objects.get_or_create(event_id=event_id)
            if not created:
                return Response({"status": "duplicate"})
        event = json.loads(body)
        if event.get("event") in {"payment.captured", "order.paid"}:
            entity = event["payload"]["payment"]["entity"]
            payment = Payment.objects.filter(order_id=entity.get("order_id")).first()
            if payment:
                gw = get_gateway("razorpay")
                # Webhook is already authenticated, so compute the signature ourselves.
                services.capture(payment, entity["id"], gw.signature(payment.order_id, entity["id"]), entity.get("method", ""))
        elif event.get("event") == "payment.failed":
            entity = event["payload"]["payment"]["entity"]
            payment = Payment.objects.filter(order_id=entity.get("order_id")).first()
            if payment:
                services.mark_failed(payment, entity.get("error_description", "Payment failed"))
        return Response({"status": "ok"})


# ---------------------------------------------------------------- HTML pages (opened in the app's WebView)
PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GoLoc · Secure payment</title><style>
body{{margin:0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;background:#F6EFE1;color:#12211F}}
.wrap{{max-width:420px;margin:0 auto;padding:28px 20px}}.card{{background:#FBF8F1;border-radius:18px;padding:20px;
box-shadow:0 6px 24px rgba(18,33,31,.08)}}h1{{font-size:20px;margin:0 0 4px}}.muted{{color:#8A7F6B;font-size:14px}}
.row{{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(18,33,31,.08);font-size:15px}}
.total{{font-weight:700;font-size:18px;border:0}}button{{width:100%;border:0;border-radius:14px;padding:16px;font-size:16px;
font-weight:700;margin-top:14px;cursor:pointer}}.pay{{background:#2F7A6B;color:#fff}}.ghost{{background:transparent;color:#E15B3F}}
.badge{{display:inline-block;background:#E8A33D;color:#12211F;border-radius:8px;padding:3px 8px;font-size:12px;font-weight:700}}
</style></head><body><div class="wrap"><div class="card">{body}</div>
<p class="muted" style="text-align:center;margin-top:16px">🔒 Payments are protected. Insurance &amp; SOS activate once paid.</p></div>
<script>const TOKEN={token};const RESULT={result};
async function verify(extra){{const r=await fetch({verify},{{method:'POST',headers:{{'Content-Type':'application/json'}},
body:JSON.stringify(Object.assign({{token:TOKEN}},extra))}});const j=await r.json().catch(()=>({{}}));
location.href=RESULT+'?status='+((r.ok&&j.status==='captured')?'success':(extra.outcome==='failed'?'failed':'error'));}}
{script}</script></body></html>"""


def _summary(payment):
    b = payment.booking
    rows = [("Trip fare", b.fare), ("Trip insurance", b.insurance_fee)]
    lines = "".join(f'<div class="row"><span>{escape(k)}</span><span>₹{v:,}</span></div>' for k, v in rows)
    return (f'<h1>{escape(b.service_snapshot.get("title", "Your trip"))}</h1>'
            f'<div class="muted">{escape(b.code)} · {escape(b.captain.name)} · {b.start_date:%d %b %Y} · {b.guests} guest(s)</div>'
            f'<div style="height:12px"></div>{lines}<div class="row total"><span>Total</span><span>₹{b.total:,}</span></div>')


def checkout_page(request, token):
    payment = _payment_from_token(token)
    # Relative URLs: the page is served by this API, whatever host the phone used to reach it.
    common = {"token": json.dumps(token), "result": json.dumps("/pay/result/"), "verify": json.dumps("/api/v1/payments/verify/")}
    if payment.status != Payment.Status.CREATED:
        return HttpResponse(PAGE.format(body="<h1>Already processed</h1><p class='muted'>Return to the app.</p>",
                                        script=f"location.href=RESULT+'?status={'success' if payment.status == 'captured' else 'error'}';", **common))
    if payment.gateway == "fake":
        body = (_summary(payment) + '<p><span class="badge">TEST MODE</span> No real money moves.</p>'
                '<button class="pay" onclick="this.disabled=true;verify({})">Pay ₹' + f"{payment.amount:,}" + '</button>'
                '<button class="ghost" onclick="verify({outcome:\'failed\',reason:\'Simulated failure\'})">Simulate failure</button>')
        return HttpResponse(PAGE.format(body=body, script="", **common))
    b = payment.booking
    options = {
        "key": get_gateway("razorpay").key_id, "amount": payment.amount * 100, "currency": "INR", "order_id": payment.order_id,
        "name": "GoLoc", "description": f"{b.code} · {b.service_snapshot.get('title', '')}"[:250],
        "prefill": {"contact": b.traveler.phone_number, "name": b.traveler.full_name}, "theme": {"color": "#2F7A6B"},
    }
    script = (
        f"const o={json.dumps(options)};o.handler=function(r){{verify(r)}};"
        "o.modal={ondismiss:function(){location.href=RESULT+'?status=cancelled'}};"
        "const rzp=new Razorpay(o);rzp.on('payment.failed',function(r){verify({outcome:'failed',reason:(r.error&&r.error.description)||''})});"
        "document.getElementById('pay').onclick=function(){rzp.open()};rzp.open();"
    )
    body = _summary(payment) + f'<button class="pay" id="pay">Pay ₹{payment.amount:,}</button>'
    html = PAGE.format(body=body, script=script, **common).replace(
        "</head>", '<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>')
    return HttpResponse(html)


def result_page(request):
    state = request.GET.get("status", "")
    msg = {"success": ("Payment successful ✅", "Your trip is confirmed."),
           "cancelled": ("Payment cancelled", "You can try again from the app."),
           "failed": ("Payment failed", "No money was taken. Try again.")}.get(state, ("Something went wrong", "Check your booking in the app."))
    body = f"<h1>{msg[0]}</h1><p class='muted'>{msg[1]}</p>"
    # Desktop app opened checkout in a popup: tell it how it ended, then close.
    # (Phones detect this URL in their WebView instead.) The status is whitelisted.
    status = state if state in {"success", "cancelled", "failed"} else "error"
    script = (f"if(window.opener){{window.opener.postMessage({{goloc:'pay',status:{json.dumps(status)}}},'*');"
              "setTimeout(function(){window.close()},1500)}")
    return HttpResponse(PAGE.format(body=body, script=script, token='""', result='""', verify='""'))


# ---------------------------------------------------------------- captain wallet
class LedgerSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.code", default=None)
    paid_to_agency = serializers.SerializerMethodField(help_text="Earned on an agency trip: the money went to the agency.")

    class Meta:
        model = LedgerEntry
        fields = ["id", "kind", "amount", "note", "booking_code", "paid_to_agency", "created_at"]

    def get_paid_to_agency(self, obj):
        return obj.agency_id is not None


class PayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payout
        fields = ["id", "code", "amount", "status", "destination", "reference", "note", "processed_at", "created_at"]


class WalletView(APIView):
    permission_classes = [IsCaptain]

    def get(self, request):
        captain = my_profile(request)
        # Every trip they did, agency ones included (marked), so they see all their work; the balance is only their own.
        entries = LedgerEntry.objects.filter(captain=captain).select_related("booking")[:30]
        payouts = Payout.objects.filter(captain=captain)[:20]
        agency = captain.agency
        return Response({
            **services.wallet(captain),
            "agency": {"code": agency.code, "name": agency.name} if agency else None,
            "agency_earned": LedgerEntry.objects.filter(captain=captain, agency__isnull=False,
                                                        kind=LedgerEntry.Kind.TRIP_EARNING).aggregate(s=Sum("amount"))["s"] or 0,
            "ledger": LedgerSerializer(entries, many=True).data,
            "payouts": PayoutSerializer(payouts, many=True).data,
            "payout_account": getattr(getattr(captain, "payout_account", None), "masked", None),
        })


class RequestPayoutView(APIView):
    permission_classes = [IsCaptain]

    def post(self, request):
        captain = my_profile(request)
        try:
            amount = int(request.data.get("amount", 0))
        except (TypeError, ValueError):
            amount = 0
        payout = services.request_payout(captain, amount)
        return Response(PayoutSerializer(payout).data, status=status.HTTP_201_CREATED)


class EarningsByMonthView(generics.GenericAPIView):
    permission_classes = [IsCaptain]

    def get(self, request):
        from django.db.models.functions import TruncMonth

        captain = my_profile(request)
        rows = (LedgerEntry.objects.filter(captain=captain, kind=LedgerEntry.Kind.TRIP_EARNING)
                .annotate(m=TruncMonth("created_at")).values("m").annotate(total=Sum("amount")).order_by("-m")[:12])
        return Response([{"month": r["m"].strftime("%Y-%m"), "total": r["total"]} for r in rows])
