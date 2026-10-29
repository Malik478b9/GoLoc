export type Check = { key: string; label: string; done: boolean };
export type Agency = {
  id: string; code: string; name: string; legal_name: string; city_id: string; city_name: string; address: string; gstin: string; pan: string;
  contact_email: string; logo: string | null; owner_name: string; owner_phone: string;
  review_status: "draft" | "pending" | "approved" | "rejected"; review_note: string; submitted_at: string | null; is_on_hold: boolean; hold_reason: string;
  checklist: { items: Check[]; percent: number; can_submit: boolean };
};

export type BookingRow = {
  id: string; code: string; status: string; status_label: string; kind: string; tier: string; guests: number; start_date: string; end_date: string;
  title: string; captain: { id: string; code: string; name: string }; traveler: { name: string; phone_masked?: string; phone?: string };
  city_name: string; fare: number; total: number; captain_net: number; request_expires_at: string | null; created_at: string;
};

export type Wallet = { available: number; pending_trips: number; this_month: number; lifetime_earned: number; paid_out: number; in_transit: number; min_payout: number; on_hold: boolean };

export type Service = {
  id: string; kind: "experience" | "guide" | "package"; title: string; description: string; category: string; cover_image: string | null; max_guests: number;
  price: number; included_guests: number; extra_guest_price: number; duration_hours: number; start_time: string; stops: string[]; duration_days: number;
  normal_price: number; medium_price: number; lavish_price: number; tier_inclusions: Record<string, string[]>; itinerary: string[]; is_active: boolean;
  from_price: number; city_id: string | null; city_name: string | null; captains_offering: number;
};

export type AgencyCaptain = {
  id: string; code: string; name: string; phone: string; avatar: string | null; city_name: string; captain_type: string; review_status: string;
  is_live: boolean; is_on_hold: boolean; rating_avg: string; rating_count: number; trips_completed: number; years_experience: number;
  agency_joined_at: string; month_earned: number; upcoming: number; vehicles: string[]; kyc_ok: boolean;
};

export type Options = { document_types: { value: string; label: string; required: boolean }[]; categories: string[]; vehicle_kinds: { value: string; label: string }[] };
