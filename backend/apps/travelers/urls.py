from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MyTravelerProfileView, SavedCaptainViewSet

router = DefaultRouter()
router.register("saved-captains", SavedCaptainViewSet, basename="saved-captains")

urlpatterns = [
    path("me/", MyTravelerProfileView.as_view(), name="my-traveler-profile"),
] + router.urls
