import axios from "axios";

// Same backend as the mobile apps (Section 4: Architecture Overview).
// Admin-console users authenticate with the same JWT/OTP flow but must be
// staff (is_staff=True) — enforced by permissions.IsAdminUser on the backend.
export const API_BASE_URL = "http://172.20.141.201:8000/api/v1";

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Marketplace ---
export const fetchCaptains = (params?: { verification_status?: string; q?: string }) =>
  api.get("/captains/discover/", { params });

// --- Ops / Finance ---
export const lookupBooking = (bkgId: string) => api.get(`/bookings/lookup/${bkgId}/`);
export const fetchAllBookings = () => api.get("/bookings/lookup/");
export const fetchPayoutLedger = () => api.get("/payments/payouts/me/"); // Admin variant would add a staff-only ledger endpoint

// --- Trust / Growth ---
export const fetchIncidents = () => api.get("/admin-ops/incidents/");
export const updateIncident = (id: string, payload: Partial<{ status: string; assigned_admin: string }>) =>
  api.patch(`/admin-ops/incidents/${id}/`, payload);

export const fetchDisputes = () => api.get("/admin-ops/disputes/");
export const resolveDispute = (id: string, payload: { status: string; resolution_notes: string }) =>
  api.patch(`/admin-ops/disputes/${id}/`, payload);

// --- Cities ---
export const fetchCities = () => api.get("/cities/");
