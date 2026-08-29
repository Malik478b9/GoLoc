from django.urls import path

from . import webhooks
from .views import CreateCheckoutOrderView, MyPayoutLedgerView

urlpatterns = [
    path("checkout/", CreateCheckoutOrderView.as_view(), name="create-checkout-order"),
    path("payouts/me/", MyPayoutLedgerView.as_view(), name="my-payout-ledger"),
    path("webhooks/razorpay/", webhooks.razorpay_webhook, name="razorpay-webhook"),
]
