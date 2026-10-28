from django.urls import path

from . import views

urlpatterns = [
    path("", views.DiscoverView.as_view(), name="discover"),
    path("saved/", views.SavedTripsView.as_view(), name="discover-saved"),
    path("saved/<str:key>/", views.SaveTripView.as_view(), name="discover-save"),
]
