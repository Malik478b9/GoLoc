from django.urls import path

from . import views

# /api/v1/captain/ — the signed-in Captain's own business
captain_urlpatterns = [
    path("options/", views.OptionsView.as_view(), name="captain-options"),
    path("profile/", views.MyProfileView.as_view(), name="captain-profile"),
    path("profile/avatar/", views.AvatarView.as_view(), name="captain-avatar"),
    path("checklist/", views.ChecklistView.as_view(), name="captain-checklist"),
    path("submit/", views.SubmitView.as_view(), name="captain-submit"),
    path("go-live/", views.GoLiveView.as_view(), name="captain-go-live"),
    path("dashboard/", views.DashboardView.as_view(), name="captain-dashboard"),
    path("services/", views.ServiceListView.as_view(), name="captain-services"),
    path("services/<uuid:pk>/", views.ServiceDetailView.as_view(), name="captain-service"),
    path("services/<uuid:pk>/cover/", views.ServiceCoverView.as_view(), name="captain-service-cover"),
    path("vehicles/", views.VehicleListView.as_view(), name="captain-vehicles"),
    path("vehicles/<uuid:pk>/", views.VehicleDetailView.as_view(), name="captain-vehicle"),
    path("documents/", views.DocumentListView.as_view(), name="captain-documents"),
    path("availability/", views.AvailabilityView.as_view(), name="captain-availability"),
    path("availability/blocked/", views.BlockedDateView.as_view(), name="captain-blocked"),
    path("availability/blocked/<int:pk>/", views.BlockedDateView.as_view(), name="captain-blocked-delete"),
    path("payout-account/", views.PayoutAccountView.as_view(), name="captain-payout-account"),
]

# /api/v1/captains/ — public discovery for travelers
public_urlpatterns = [
    path("", views.DiscoveryView.as_view(), name="captain-discovery"),
    path("match/", views.MatchView.as_view(), name="captain-match"),
    path("quote/", views.QuoteView.as_view(), name="captain-quote"),
    path("saved/", views.SavedListView.as_view(), name="captain-saved"),
    path("services/<uuid:pk>/", views.PublicServiceView.as_view(), name="public-service"),
    path("<uuid:pk>/save/", views.SaveToggleView.as_view(), name="captain-save"),
    path("<str:id_or_code>/", views.CaptainDetailView.as_view(), name="captain-detail"),
    path("<str:id_or_code>/calendar/", views.CaptainCalendarView.as_view(), name="captain-calendar"),
]
