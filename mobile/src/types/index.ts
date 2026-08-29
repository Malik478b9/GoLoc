// Mirrors the DRF serializers in the backend (apps/*/serializers.py) so the
// two codebases stay in sync as the API evolves.

export type Role = "traveler" | "captain" | "admin";

export interface User {
  id: string;
  phone_number: string;
  phone_verified: boolean;
  full_name: string;
  role: Role;
  primary_city: string | null;
}

export interface City {
  id: string;
  name: string;
  state: string;
  is_live: boolean;
  latitude: number | null;
  longitude: number | null;
}

export type Tier = "normal" | "medium" | "lavish";

export interface PricingTier {
  id: string;
  tier: Tier;
  price_per_person: string;
}

export interface Service {
  id: string;
  service_type: "day_experience" | "package";
  title: string;
  description: string;
  duration_days: number;
  pricing_tiers: PricingTier[];
}

export interface CaptainPublicProfile {
  id: string;
  cap_id: string;
  business_name: string;
  bio: string;
  specialties: string;
  languages: string;
  home_city: string;
  average_rating: string;
  total_trips: number;
  services: Service[];
}

export type BookingStatus =
  | "requested"
  | "accepted"
  | "paid"
  | "in_progress"
  | "completed"
  | "cancelled_by_traveler"
  | "cancelled_by_captain"
  | "disputed";

export interface Booking {
  id: string;
  bkg_id: string;
  captain: string;
  captain_cap_id: string;
  service: string;
  pricing_tier: string;
  pax_count: number;
  trip_start_date: string;
  trip_end_date: string;
  fare_amount: string;
  insurance_amount: string;
  tip_amount: string;
  total_amount: string;
  status: BookingStatus;
  sos_active: boolean;
  insurance_active: boolean;
  created_at: string;
}

export interface Reel {
  id: string;
  captain: string;
  captain_cap_id: string;
  captain_business_name: string;
  thumbnail_url: string;
  caption: string;
  status: string;
  views_count: number;
  likes_count: number;
}
