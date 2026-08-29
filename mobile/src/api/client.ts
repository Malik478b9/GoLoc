import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

// Point this at your Azure-hosted API (Section 4: Architecture Overview).
// Use a per-environment value (dev/staging/prod) via an env config in a real build.
export const API_BASE_URL = "http://172.20.141.201:8000/api/v1"; // your actual IP
export const WS_BASE_URL = "ws://172.20.141.201:8000";

export const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On a 401, try the refresh token once before giving up (session expiry ->
// back to the OTP login screen is handled by the caller, not here).
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = await AsyncStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
            refresh,
          });
          await AsyncStorage.setItem("access_token", data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return apiClient(original);
        } catch {
          await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
        }
      }
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
export const requestOTP = (phone_number: string, purpose: string = "login") =>
  apiClient.post("/auth/otp/request/", { phone_number, purpose });

export const verifyOTP = (payload: {
  phone_number: string;
  code: string;
  role?: string;
  full_name?: string;
  primary_city_id?: string;
}) => apiClient.post("/auth/otp/verify/", payload);

export const fetchMe = () => apiClient.get("/auth/me/");

// --- Discovery / Reels (Traveler Explore group) ---
export const fetchReelFeed = () => apiClient.get("/content/reels/");
export const fetchCaptains = (params: { city?: string; q?: string }) =>
  apiClient.get("/captains/discover/", { params });
export const fetchCaptainProfile = (id: string) => apiClient.get(`/captains/discover/${id}/`);

// --- Bookings ---
export const createBooking = (payload: {
  service_id: string;
  pricing_tier_id: string;
  pax_count: number;
  trip_start_date: string;
  trip_end_date: string;
}) => apiClient.post("/bookings/", payload);

export const fetchMyBookings = () => apiClient.get("/bookings/");
export const cancelBooking = (id: string) => apiClient.post(`/bookings/${id}/cancel/`);
export const acceptBooking = (id: string) => apiClient.post(`/bookings/${id}/accept/`);
export const completeBooking = (id: string) => apiClient.post(`/bookings/${id}/complete/`);

// --- Payments ---
export const createCheckoutOrder = (booking_id: string) =>
  apiClient.post("/payments/checkout/", { booking_id });

// --- Safety ---
export const fetchMySOSAlerts = () => apiClient.get("/safety/sos/");
