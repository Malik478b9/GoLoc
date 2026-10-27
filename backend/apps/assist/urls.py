from django.urls import path

from . import views

urlpatterns = [
    path("status/", views.AIStatusView.as_view(), name="ai-status"),
    path("assist/", views.AssistView.as_view(), name="ai-assist"),
]
