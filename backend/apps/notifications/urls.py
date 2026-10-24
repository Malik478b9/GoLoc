from django.urls import path

from . import views

urlpatterns = [
    path("", views.NotificationListView.as_view(), name="notifications"),
    path("unread/", views.UnreadCountView.as_view(), name="notifications-unread"),
    path("read/", views.MarkReadView.as_view(), name="notifications-read"),
    path("devices/", views.DeviceView.as_view(), name="notification-devices"),
]
