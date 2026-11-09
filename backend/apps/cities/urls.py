from django.urls import path

from . import views

urlpatterns = [
    path("", views.LiveCityListView.as_view(), name="city-list"),
    path("places/", views.PlaceSearchView.as_view(), name="place-search"),
    path("places/reverse/", views.PlaceReverseView.as_view(), name="place-reverse"),
]
