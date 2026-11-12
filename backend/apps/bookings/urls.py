from django.urls import path

from . import offer_views, views

urlpatterns = [
    path("", views.BookingListCreateView.as_view(), name="bookings"),
    path("<str:ref>/", views.BookingDetailView.as_view(), name="booking-detail"),
    path("<str:ref>/cancel-preview/", views.CancelPreviewView.as_view(), name="booking-cancel-preview"),
    path("<str:ref>/offers/", offer_views.OffersView.as_view(), name="booking-offers"),
    path("<str:ref>/coupon/", offer_views.CouponView.as_view(), name="booking-coupon"),
    path("<str:ref>/voucher/", offer_views.VoucherView.as_view(), name="booking-voucher"),
    path("<str:ref>/<str:action>/", views.BookingActionView.as_view(), name="booking-action"),
]
