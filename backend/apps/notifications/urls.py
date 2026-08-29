from django.urls import path

from .views import RegisterDeviceTokenView

urlpatterns = [
    path("device-tokens/", RegisterDeviceTokenView.as_view(), name="register-device-token"),
]
