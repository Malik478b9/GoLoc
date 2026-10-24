from django.urls import path

from . import views

urlpatterns = [
    path("tickets/", views.TicketListView.as_view(), name="tickets"),
]
