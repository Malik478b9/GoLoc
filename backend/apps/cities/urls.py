from django.urls import path

from . import views

urlpatterns = [
    path("", views.LiveCityListView.as_view(), name="city-list"),
]
