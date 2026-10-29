from django.urls import path

from . import views

# /api/v1/agency/ — the signed-in agency's dashboard
urlpatterns = [
    path("options/", views.OptionsView.as_view()),
    path("profile/", views.ProfileView.as_view()),
    path("profile/logo/", views.LogoView.as_view()),
    path("documents/", views.DocumentListView.as_view()),
    path("payout-account/", views.PayoutAccountView.as_view()),
    path("submit/", views.SubmitView.as_view()),
    path("dashboard/", views.DashboardView.as_view()),
    path("captains/", views.CaptainListView.as_view()),
    path("captains/<uuid:pk>/remove/", views.CaptainRemoveView.as_view()),
    path("invites/", views.InviteListView.as_view()),
    path("invites/<uuid:pk>/", views.InviteCancelView.as_view()),
    path("services/", views.ServiceListView.as_view()),
    path("services/<uuid:pk>/", views.ServiceDetailView.as_view()),
    path("services/<uuid:pk>/cover/", views.ServiceCoverView.as_view()),
    path("vehicles/", views.VehicleListView.as_view()),
    path("vehicles/<uuid:pk>/", views.VehicleDetailView.as_view()),
    path("bookings/", views.BookingListView.as_view()),
    path("bookings/<str:ref>/", views.BookingDetailView.as_view()),
    path("bookings/<str:ref>/<str:action>/", views.BookingActionView.as_view()),
    path("wallet/", views.WalletView.as_view()),
    path("wallet/payout/", views.RequestPayoutView.as_view()),
    path("earnings/", views.EarningsView.as_view()),
]

# Added under /api/v1/captain/ — invites and membership from the Captain app
captain_urlpatterns = [
    path("agency/", views.CaptainAgencyView.as_view()),
    path("agency/invites/<uuid:pk>/<str:action>/", views.CaptainInviteView.as_view()),
    path("agency/leave/", views.CaptainLeaveView.as_view()),
]
