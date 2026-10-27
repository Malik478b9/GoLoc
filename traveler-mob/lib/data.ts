import { api, CaptainCard, CaptainDetail, City, DiscoverFeed, Paginated, Post, useAuth } from "@goloc/core";
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
export function useDiscoverFeed(city?: string) {
  return useQuery({
    queryKey: ["discover", city],
    queryFn: () => api.get<DiscoverFeed>("/discover/", { city }),
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
