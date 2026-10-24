from django.urls import path

from . import views

urlpatterns = [
    path("bookings/<str:ref>/order/", views.CreateOrderView.as_view(), name="payment-order"),
    path("verify/", views.VerifyView.as_view(), name="payment-verify"),
    path("webhooks/razorpay/", views.RazorpayWebhookView.as_view(), name="razorpay-webhook"),
    path("wallet/", views.WalletView.as_view(), name="captain-wallet"),
    path("wallet/monthly/", views.EarningsByMonthView.as_view(), name="captain-wallet-monthly"),
    path("payouts/", views.RequestPayoutView.as_view(), name="captain-payout-request"),
]

page_urlpatterns = [
    path("checkout/<str:token>/", views.checkout_page, name="pay-checkout"),
    path("result/", views.result_page, name="pay-result"),
]
