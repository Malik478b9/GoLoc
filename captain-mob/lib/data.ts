import { api, Booking } from "@goloc/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type CaptainProfile = {
  id: string;
  code: string;
  full_name: string;
  city_id: string;
  city_name: string;
  /** Set while the Captain works for an agency: it sets trips, prices and cars, and receives the earnings. */
  agency: { id: string; code: string; name: string; joined_at: string } | null;
  captain_type: "captain" | "guide";
  tagline: string;
  bio: string;
  avatar: string | null;
  years_experience: number;
  languages: string[];
  categories: string[];
  max_bookings_per_day: number;
  review_status: "draft" | "pending" | "approved" | "rejected";
  review_note: string;
  submitted_at: string | null;
  is_live: boolean;
  is_on_hold: boolean;
  hold_reason: string;
  rating_avg: string;
  rating_count: number;
  trips_completed: number;
  profile_views: number;
};

export type Checklist = {
  items: { key: string; label: string; done: boolean }[];
  percent: number;
  can_submit: boolean;
  can_go_live: boolean;
  required_documents: string[];
};

export type Wallet = {
  available: number;
  pending_trips: number;
  this_month: number;
  lifetime_earned: number;
  paid_out: number;
  in_transit: number;
  min_payout: number;
  on_hold: boolean;
};

export type Dashboard = {
  profile: CaptainProfile;
  checklist: Checklist;
  wallet: Wallet;
  upcoming: Booking[];
  upcoming_count: number;
  pending_requests: Booking[];
  pending_count: number;
  reel_views: number;
};

export type Options = {
  languages: string[];
  categories: string[];
  document_types: { value: string; label: string }[];
  vehicle_kinds: { value: string; label: string }[];
};

export function useProfile() {
  return useQuery({ queryKey: ["captain-profile"], queryFn: () => api.get<CaptainProfile | null>("/captain/profile/") });
}

export function useDashboard() {
  const profile = useProfile();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/captain/dashboard/"),
    enabled: !!profile.data,
    refetchInterval: 30000,
  });
}

export type AgencyMembership = {
  agency: { id: string; code: string; name: string; city_name: string; joined_at: string; logo: string | null } | null;
  invites: { id: string; agency: { code: string; name: string; city_name: string }; created_at: string }[];
};

export function useAgency() {
  return useQuery({ queryKey: ["captain-agency"], queryFn: () => api.get<AgencyMembership>("/captain/agency/") });
}

export function useOptions() {
  return useQuery({ queryKey: ["captain-options"], queryFn: () => api.get<Options>("/captain/options/"), staleTime: 60 * 60_000 });
}

export function useRefreshBusiness() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["captain-profile"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["checklist"] });
    qc.invalidateQueries({ queryKey: ["captain-agency"] });
    qc.invalidateQueries({ queryKey: ["my-services"] });
    qc.invalidateQueries({ queryKey: ["vehicles"] });
  };
}
