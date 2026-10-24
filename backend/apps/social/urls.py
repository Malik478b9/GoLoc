from django.urls import path

from . import views

urlpatterns = [
    path("feed/", views.FeedView.as_view(), name="feed"),
    path("posts/<uuid:pk>/like/", views.LikeView.as_view(), name="post-like"),
    path("posts/<uuid:pk>/event/", views.EventView.as_view(), name="post-event"),
    path("mine/", views.MyPostsView.as_view(), name="my-posts"),
    path("mine/insights/", views.InsightsView.as_view(), name="my-posts-insights"),
    path("mine/<uuid:pk>/", views.MyPostDetailView.as_view(), name="my-post"),
]
