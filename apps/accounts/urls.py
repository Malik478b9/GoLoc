from django.urls import path

from . import views

urlpatterns = [
    path("otp/request/", views.RequestOTPView.as_view(), name="otp-request"),
    path("otp/verify/", views.VerifyOTPView.as_view(), name="otp-verify"),
    path("me/", views.MeView.as_view(), name="me"),
]
