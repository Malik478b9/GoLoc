from django.urls import path

from . import views

urlpatterns = [
    path("", views.ConversationListView.as_view(), name="conversations"),
    path("<uuid:pk>/messages/", views.MessagesView.as_view(), name="conversation-messages"),
]
