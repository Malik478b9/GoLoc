from django.urls import path

from . import views

urlpatterns = [
    path("", views.CreateReviewView.as_view(), name="review-create"),
    path("mine/", views.MyReceivedReviewsView.as_view(), name="reviews-received"),
    path("<int:pk>/reply/", views.ReplyView.as_view(), name="review-reply"),
    path("captains/<uuid:captain_id>/", views.CaptainReviewsView.as_view(), name="captain-reviews"),
]
