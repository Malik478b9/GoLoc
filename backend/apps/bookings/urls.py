from django.urls import path

from . import views

urlpatterns = [
    path("", views.BookingListCreateView.as_view(), name="bookings"),
    path("<str:ref>/", views.BookingDetailView.as_view(), name="booking-detail"),
    path("<str:ref>/cancel-preview/", views.CancelPreviewView.as_view(), name="booking-cancel-preview"),
    path("<str:ref>/<str:action>/", views.BookingActionView.as_view(), name="booking-action"),
]
