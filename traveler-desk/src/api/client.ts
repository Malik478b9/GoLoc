/**
 * API client for this app. Same file in traveler-desk, captain-desk and
 * admin-desk — only APP_ROLE differs. Keep them in sync.
 *
 * - Base URL comes from VITE_API_BASE_URL (see .env.example).
 * - Access tokens are short-lived (30 min). When one expires, the next
 *   request transparently uses the refresh token to get a new pair and
 *   retries, so people stay signed in for 30 days of activity.
 * - If refreshing fails (revoked, account disabled, 30 days idle), a
 *   "goloc:signed-out" event fires and the app returns to the login screen.
 */
import axios, { AxiosError, type AxiosRequestConfig } from "axios";

export const APP_ROLE = "traveler" as const;
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || "http://localhost:8001/api/v1";

const ACCESS_KEY = "goloc_access";
const REFRESH_KEY = "goloc_refresh";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------
export interface City {
  id: string;
  name: string;
  slug: string;
  state: string;
  latitude: string | null;
  longitude: string | null;
}

export interface User {
  id: string;
  phone_number: string;
  phone_verified: boolean;
  full_name: string;
  email: string;
  role: "traveler" | "captain" | "admin";
  is_admin: boolean;
  city: City | null;
  created_at: string;
}

export interface OTPSent {
  detail: string;
  phone_number: string;
  expires_in: number;
  resend_in: number;
  dev_code?: string; // only from a DEBUG backend
}

export interface PublicCaptain {
  id: string; captain_name: string; city_name: string; bio: string; years_experience: number;
  languages: string[]; categories: string[]; trips_completed: number;
  services: ServiceOffer[];
}
export interface ServiceOffer {
  id: string; title: string; description: string; category: string; normal_price: number; medium_price: number;
  lavish_price: number; duration_hours: number; is_active: boolean;
}
export interface Booking {
  id: string; service_title: string; captain_name: string; traveler_name: string; city_name: string;
  trip_date: string; travelers_count: number; tier: "normal" | "medium" | "lavish";
  price_snapshot: number; note: string; status: string; created_at: string;
}

interface AuthResponse {
  access: string;
  refresh: string;
  created: boolean;
  user: User;
}

// --------------------------------------------------------------------------
// Token storage (localStorage can throw in private mode — never let that crash the app)
// --------------------------------------------------------------------------
const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const hasSession = () => Boolean(store.get(REFRESH_KEY));

function saveTokens(access: string, refresh: string) {
  store.set(ACCESS_KEY, access);
  store.set(REFRESH_KEY, refresh);
}

function clearTokens() {
  store.remove(ACCESS_KEY);
  store.remove(REFRESH_KEY);
}

// --------------------------------------------------------------------------
// Axios instance with auth + refresh
// --------------------------------------------------------------------------
export const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = store.get(ACCESS_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight: Promise<string> | null = null;

/** One refresh at a time, even if ten requests fail together. */
function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    const refresh = store.get(REFRESH_KEY);
    refreshInFlight = (refresh
      ? axios.post(`${API_BASE_URL}/auth/token/refresh/`, { refresh }, { timeout: 15000 })
      : Promise.reject(new Error("no refresh token"))
    )
      .then(({ data }) => {
        saveTokens(data.access, data.refresh ?? refresh);
        return data.access as string;
      })
      .catch((err) => {
        // Only a definite "no" from the server ends the session; a network blip shouldn't.
        if (!axios.isAxiosError(err) || err.response) {
          clearTokens();
          window.dispatchEvent(new Event("goloc:signed-out"));
        }
        throw err;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && store.get(REFRESH_KEY)) {
      original._retried = true;
      const access = await refreshAccessToken();
      original.headers = { ...(original.headers || {}), Authorization: `Bearer ${access}` };
      return api(original);
    }
    throw error;
  },
);

// --------------------------------------------------------------------------
// Errors — the backend always answers {detail, code, fields?, retry_after?}
// --------------------------------------------------------------------------
export interface ApiErrorInfo {
  message: string;
  code: string;
  retryAfter?: number;
  fields?: Record<string, string[]>;
}

export function apiError(err: unknown, fallback = "Something went wrong. Please try again."): ApiErrorInfo {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return { message: "Can't reach GoLoc right now. Check your connection and try again.", code: "network" };
    }
    const data = err.response.data as Partial<{ detail: string; code: string; retry_after: number; fields: Record<string, string[]> }>;
    return {
      message: data?.detail || fallback,
      code: data?.code || `http_${err.response.status}`,
      retryAfter: data?.retry_after,
      fields: data?.fields,
    };
  }
  return { message: fallback, code: "unknown" };
}

// --------------------------------------------------------------------------
// Endpoints
// --------------------------------------------------------------------------
export async function requestOTP(phone_number: string): Promise<OTPSent> {
  const { data } = await api.post<OTPSent>("/auth/otp/request/", { phone_number, role: APP_ROLE });
  return data;
}

export async function verifyOTP(phone_number: string, code: string, full_name?: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/otp/verify/", { phone_number, code, full_name, role: APP_ROLE });
  saveTokens(data.access, data.refresh);
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me/");
  return data;
}

export async function updateMe(patch: Partial<{ full_name: string; email: string; city_id: string | null }>): Promise<User> {
  const { data } = await api.patch<User>("/auth/me/", patch);
  return data;
}

export async function fetchCities(): Promise<City[]> {
  const { data } = await api.get<City[]>("/cities/");
  return data;
}

export async function discoverCaptains(params: { city?: string; category?: string; q?: string } = {}): Promise<PublicCaptain[]> {
  const { data } = await api.get<{ results: PublicCaptain[] } | PublicCaptain[]>("/marketplace/captains/", { params });
  return Array.isArray(data) ? data : data.results;
}

export async function createBooking(input: { service_id: string; trip_date: string; travelers_count: number; tier: Booking["tier"]; note: string }): Promise<Booking> {
  const { data } = await api.post<Booking>("/marketplace/bookings/", input);
  return data;
}

export async function fetchBookings(): Promise<Booking[]> {
  const { data } = await api.get<{ results: Booking[] } | Booking[]>("/marketplace/bookings/");
  return Array.isArray(data) ? data : data.results;
}

export async function transitionBooking(id: string, status: string): Promise<Booking> {
  const { data } = await api.post<Booking>(`/marketplace/bookings/${id}/transition/`, { status });
  return data;
}

export async function logout(): Promise<void> {
  const refresh = store.get(REFRESH_KEY);
  clearTokens();
  if (refresh) {
    try {
      await axios.post(`${API_BASE_URL}/auth/logout/`, { refresh }, { timeout: 5000 });
    } catch {
      /* already signed out locally; server token will expire on its own */
    }
  }
}
