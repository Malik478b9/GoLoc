from django.urls import path

from . import views

urlpatterns = [
    path("emergency/", views.EmergencyView.as_view(), name="emergency-services"),
    path("shared/<str:token>/", views.SharedTripView.as_view(), name="shared-trip"),
    path("<str:ref>/location/", views.LocationView.as_view(), name="trip-location"),
    path("<str:ref>/live/", views.LiveView.as_view(), name="trip-live"),
    path("<str:ref>/sos/", views.SOSView.as_view(), name="trip-sos"),
    path("<str:ref>/sos/history/", views.MySOSView.as_view(), name="trip-sos-history"),
]
