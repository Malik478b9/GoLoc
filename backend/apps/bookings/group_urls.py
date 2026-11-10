from django.urls import path

from . import group_views as views

# /api/v1/groups/ — group departures travelers can join
urlpatterns = [
    path("", views.GroupListView.as_view(), name="groups"),
    path("<str:ref>/", views.GroupDetailView.as_view(), name="group-detail"),
    path("<str:ref>/join/", views.GroupJoinView.as_view(), name="group-join"),
]

# /api/v1/captain/groups/ — the signed-in Captain's departures
captain_urlpatterns = [
    path("groups/", views.CaptainGroupListView.as_view(), name="captain-groups"),
    path("groups/<uuid:pk>/", views.CaptainGroupDetailView.as_view(), name="captain-group"),
    path("groups/<uuid:pk>/cancel/", views.CaptainGroupCancelView.as_view(), name="captain-group-cancel"),
]
