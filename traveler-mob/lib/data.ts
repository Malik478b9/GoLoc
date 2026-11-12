import { api, CaptainCard, CaptainDetail, City, DiscoverFeed, GroupTrip, Paginated, Place, Post, todayIST, useAuth, UserPlace } from "@goloc/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

// ---------------------------------------------------------------- city
export function useCities() {
  return useQuery({ queryKey: ["cities"], queryFn: () => api.get<City[]>("/cities/"), staleTime: 10 * 60_000 });
}

/** The city the traveler is exploring: their saved city, else the first live one. */
export function useCity(): City | undefined {
  const user = useAuth((s) => s.user);
  const cities = useCities();
  return user?.city ?? cities.data?.find((c) => c.slug === "hyderabad") ?? cities.data?.[0];
}

export async function changeCity(cityId: string) {
  const me = await api.patch<any>("/auth/me/", { city_id: cityId });
  useAuth.getState().setUser(me);
}

/** Where the traveler is exploring from (any place in India); falls back to their GoLoc city. */
export function usePlace(): UserPlace | undefined {
  const user = useAuth((s) => s.user);
  const city = useCity();
  if (user?.place) return user.place;
  return city ? { name: city.name, kind: "City", area: "", state: city.state, lat: null, lng: null, nearest_city_km: 0 } : undefined;
}

/** Set any place in India; the server also moves the traveler's GoLoc city to the nearest one. */
export async function changePlace(p: Place) {
  const me = await api.patch<any>("/auth/me/", { set_place: { name: p.name, kind: p.kind, area: p.area, state: p.state, lat: p.lat, lng: p.lng } });
  useAuth.getState().setUser(me);
}

/** Type-ahead search over every place in India. */
export function usePlaceSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["places", term.toLowerCase()],
    queryFn: () => api.get<Place[]>("/cities/places/", { q: term }),
    enabled: term.length >= 2,
    staleTime: 60 * 60_000,
    placeholderData: (prev) => prev,
  });
}

// ---------------------------------------------------------------- captains
export function useCaptain(idOrCode: string | undefined) {
  return useQuery({ queryKey: ["captain", idOrCode], queryFn: () => api.get<CaptainDetail>(`/captains/${idOrCode}/`), enabled: !!idOrCode });
}

/** Warm the profile cache on press-in so the next screen opens instantly. */
export function usePrefetchCaptain() {
  const qc = useQueryClient();
  return (id: string) => qc.prefetchQuery({ queryKey: ["captain", id], queryFn: () => api.get<CaptainDetail>(`/captains/${id}/`), staleTime: 30_000 });
}

export function useDiscovery(params: Record<string, string | undefined>) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  return useQuery({
    queryKey: ["captains", clean],
    queryFn: () => api.get<Paginated<CaptainCard>>("/captains/", clean),
    placeholderData: (prev) => prev,
  });
}

/** Seasonal, distance-aware trip posters for the home screen. */
export function useDiscoverFeed(city?: string, place?: UserPlace) {
  const at = place?.lat != null && place?.lng != null ? { lat: place.lat, lng: place.lng } : {};
  return useQuery({
    queryKey: ["discover", city, at.lat ?? null, at.lng ?? null],
    queryFn: () => api.get<DiscoverFeed>("/discover/", { city, ...at }),
    enabled: !!city,
    staleTime: 10 * 60_000,
    // The AI copy is written in the background on the first visit of the month: pick it up shortly after.
    refetchInterval: (q) => (q.state.data && !q.state.data.ai && q.state.dataUpdateCount < 4 ? 15_000 : false),
  });
}

export function useFeed(city?: string) {
  return useQuery({
    queryKey: ["feed", city],
    queryFn: () => api.get<Paginated<Post>>("/social/feed/", { city, page_size: 12 }),
    enabled: !!city,
  });
}

export async function toggleSave(qc: ReturnType<typeof useQueryClient>, captainId: string, saved: boolean) {
  if (saved) await api.del(`/captains/${captainId}/save/`);
  else await api.post(`/captains/${captainId}/save/`);
  qc.invalidateQueries({ queryKey: ["captains"] });
  qc.invalidateQueries({ queryKey: ["captain"] });
  qc.invalidateQueries({ queryKey: ["saved"] });
}

// ---------------------------------------------------------------- compare tray (max 3)
type CompareState = { ids: string[]; toggle: (id: string) => void; clear: () => void };
export const useCompare = create<CompareState>((set, get) => ({
  ids: [],
  toggle: (id) => {
    const ids = get().ids;
    set({ ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-3) });
  },
  clear: () => set({ ids: [] }),
}));

export function trackPost(postId: string, type: "view" | "profile_open" | "booking_start") {
  api.post(`/social/posts/${postId}/event/`, { type }).catch(() => {});
}

/** Open group departures travelers can join (by city or by Captain). */
export function useGroupTrips(params: { city?: string; captain?: string }) {
  return useQuery({
    queryKey: ["groups", params.city ?? "", params.captain ?? ""],
    queryFn: () => api.get<GroupTrip[]>("/groups/", { ...(params.city ? { city: params.city } : {}), ...(params.captain ? { captain: params.captain } : {}) }),
    enabled: !!(params.city || params.captain),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------- trip plan
/**
 * The dates and group size the traveler already chose (Explore's date filter or Build my trip).
 * Carried into Captain profiles and the booking form so nobody types them twice.
 */
export type TripPlan = { start?: string; end?: string; guests?: number };
export const useTripPlan = create<TripPlan & { setPlan: (p: TripPlan) => void }>((set) => ({
  setPlan: (p) => set(p),
}));

/** The date if it's today or later (IST), else undefined: a remembered plan never pre-fills a past day. */
export const upcoming = (iso?: string) => (iso && iso >= todayIST() ? iso : undefined);
