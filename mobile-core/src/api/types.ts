// Mirrors the backend serializers. Keep in sync when an API changes.

export type Paginated<T> = { count?: number; next: string | null; previous: string | null; results: T[] };

export type City = { id: string; name: string; slug: string; state: string; latitude: string | null; longitude: string | null };

export type User = {
  id: string;
  phone_number: string;
  full_name: string;
  email: string;
  role: "traveler" | "captain" | "admin";
  city: City | null;
};

export type ServiceKind = "experience" | "guide" | "package";
/** captain = does everything (stays, transport, packages); guide = walks with travelers and shows the way. */
export type CaptainType = "captain" | "guide";
export type Tier = "standard" | "normal" | "medium" | "lavish";

export type Service = {
  id: string;
  kind: ServiceKind;
  /** Captain's own copy of an agency trip: the agency sets it, the Captain can't edit it. */
  managed_by_agency?: boolean;
  title: string;
  description: string;
  category: string;
  cover_image: string | null;
  max_guests: number;
  price: number;
  included_guests: number;
  extra_guest_price: number;
  duration_hours: number;
  start_time: string;
  stops: string[];
  duration_days: number;
  normal_price: number;
  medium_price: number;
  lavish_price: number;
  tier_inclusions: Partial<Record<"normal" | "medium" | "lavish", string[]>>;
  itinerary: string[];
  is_active?: boolean;
  from_price: number;
};

export type CaptainCard = {
  id: string;
  code: string;
  name: string;
  avatar: string | null;
  tagline: string;
  captain_type: CaptainType;
  captain_type_label: string;
  city_name: string;
  city_slug: string;
  languages: string[];
  categories: string[];
  years_experience: number;
  rating_avg: string;
  rating_count: number;
  trips_completed: number;
  is_featured: boolean;
  /** GoLoc Verified badge (granted by Admin; a paid plan later). */
  is_verified: boolean;
  /** The agency this Captain works for, if any. */
  agency_name?: string | null;
  from_price: number | null;
  has_package: boolean;
  has_guide: boolean;
  saved?: boolean;
};

export type DayStatus = "free" | "booked" | "blocked" | "off" | "past";
export type WeeklySlot = { weekday: number; is_available: boolean; start_time: string; end_time: string };
/** GET /captains/<id>/calendar/ */
export type CaptainCalendar = {
  from: string;
  to: string;
  unavailable: string[];
  days: { date: string; status: DayStatus }[];
  weekly: WeeklySlot[];
};

export type Review = {
  id: number;
  rating: number;
  comment: string;
  captain_reply: string;
  traveler_name: string;
  trip_title: string | null;
  created_at: string;
};

export type Post = {
  id: string;
  kind: "reel" | "photo";
  media: string;
  thumbnail: string | null;
  caption: string;
  captain: { id: string; code: string; name: string; avatar: string | null; rating_avg: string; trips_completed: number };
  city_name: string;
  service_id: string | null;
  like_count: number;
  view_count: number;
  liked: boolean;
  created_at: string;
  status?: string;
  moderation_note?: string;
  profile_opens?: number;
  booking_starts?: number;
};

export type CaptainDetail = CaptainCard & {
  bio: string;
  services: Service[];
  vehicles: { kind: string; make_model: string; capacity: number; has_ac: boolean }[];
  verified: boolean;
  posts: Post[];
  reviews: Review[];
  /** Published default itineraries, newest first. */
  itineraries: ItinerarySummary[];
  stats: {
    trips_completed: number;
    rating_avg: string;
    reviews: number;
    reels: number;
    photos: number;
    /** Every itinerary they've finished, shared or private. */
    itineraries_prepared: number;
    years_experience: number;
    member_since: string;
  };
};

export type Quote = {
  fare: number;
  insurance_fee: number;
  total: number;
  commission: number;
  captain_net: number;
  insurance_premium: number;
  days: number;
};

export type BookingStatus =
  | "requested"
  | "accepted"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export type Booking = {
  id: string;
  code: string;
  status: BookingStatus;
  status_label: string;
  kind: ServiceKind;
  tier: Tier;
  guests: number;
  start_date: string;
  end_date: string;
  start_time: string;
  title: string;
  captain: { id: string; code: string; name: string; avatar: string | null; phone?: string };
  /** Captains see the name; the number only once the trip is paid and the traveler has shared it. */
  traveler: { id?: string; name: string; phone?: string; phone_masked?: string };
  city_name: string;
  /** Set when the Captain works for an agency: it set the price and receives the earnings. */
  agency_name?: string | null;
  fare: number;
  total: number;
  captain_net?: number;
  request_expires_at: string | null;
  payment_due_at: string | null;
  created_at: string;
};

export type BookingDetail = Booking & {
  service_id: string;
  itinerary: ItinerarySummary | null;
  meeting_point: string;
  note: string;
  service_snapshot: { title: string; stops: string[]; itinerary: string[]; tier_inclusions: Record<string, string[]>; duration_hours: number; duration_days: number };
  insurance_fee: number;
  insurance_policy_no: string;
  cancelled_by: string;
  cancel_reason: string;
  refund_percent: number | null;
  refunded: number;
  start_pin: string | null;
  share_url: string | null;
  review: { rating: number; comment: string; captain_reply: string } | null;
  events: { kind: string; message: string; actor_role: string; created_at: string }[];
  actions: Partial<Record<"accept" | "decline" | "cancel" | "start" | "complete" | "track" | "pay" | "sos" | "review" | "message" | "share_contact", boolean>>;
  traveler_shares_contact?: boolean;
};

export type LatLng = { lat: number; lng: number; accuracy_m?: number | null; heading?: number | null; at?: string };

export type EmergencyService = {
  kind: string;
  name: string;
  phone: string;
  address: string;
  distance_km: number | null;
  national: boolean;
};

export type LiveTrip = {
  booking_id: string;
  code: string;
  status: BookingStatus;
  title: string;
  start_date: string;
  start_time: string;
  started_at: string | null;
  meeting_point: string;
  stops: string[];
  itinerary: string[];
  captain: { name: string; code: string };
  captain_location: LatLng | null;
  traveler_location: LatLng | null;
  emergency: EmergencyService[];
  open_sos: { code: string; status: string; created_at: string }[];
};

export type Conversation = {
  id: string;
  other: { name: string; code: string | null; avatar: string | null; captain_id?: string };
  unread: number;
  booking_code: string | null;
  last_message_at: string | null;
  last_message_preview: string;
};

export type Message = { id: number; body: string; sender_role: string; mine: boolean; created_at: string };

export type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
};

export type Ticket = {
  id: number;
  code: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  resolution: string;
  refund_amount: number;
  booking_code: string | null;
  created_at: string;
};

// ---------------------------------------------------------------- itineraries
export type TravelLeg = { date_label: string; mode: string; point: string; time: string; pickup: string; notes: string };
export type ScheduleItem = {
  time: string;
  activity: string;
  place: string;
  type: "travel" | "sightseeing" | "meal" | "stay" | "activity" | "ticket" | "free";
  details: string;
  cost: string;
};
export type ItineraryDay = {
  day: number;
  date_label: string;
  title: string;
  base: string;
  overview: string;
  schedule: ScheduleItem[];
  meals: { breakfast: string; lunch: string; dinner: string };
  /** confirmed = a hotel the Captain named; otherwise an AI suggestion to confirm. */
  stay: { hotel: string; area: string; category: string; confirmed: boolean; notes: string };
  transport: string;
  tickets: { item: string; price: string; notes: string }[];
  tips: string[];
};
export type ItineraryContent = {
  title: string;
  summary: string;
  highlights: string[];
  arrival: TravelLeg;
  departure: TravelLeg;
  days: ItineraryDay[];
  inclusions: string[];
  exclusions: string[];
  cost_estimate: { item: string; amount: string }[];
  packing_list: string[];
  important_notes: string[];
};
export type ItineraryPoster = {
  headline: string;
  tagline: string;
  duration_label: string;
  highlights: string[];
  tier_label: string;
  price_line: string;
  call_to_action: string;
};
export type ItinerarySummary = {
  id: string;
  code: string;
  kind: "template" | "custom";
  title: string;
  destination: string;
  tier: "standard" | "normal" | "medium" | "lavish";
  tier_label: string;
  days: number;
  guests: number;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "generating" | "ready" | "failed";
  is_published: boolean;
  poster: Partial<ItineraryPoster>;
  share_url: string | null;
  poster_url: string | null;
  updated_at: string;
};
export type Itinerary = ItinerarySummary & {
  content: Partial<ItineraryContent>;
  arrival: Partial<{ mode: string; point: string; time: string; reference: string }>;
  departure: Partial<{ mode: string; point: string; time: string; reference: string }>;
  captain: { id: string; code: string; name: string; avatar: string | null; captain_type: CaptainType };
};

// ---------------------------------------------------------------- discover (home posters)
export type TripPoster = {
  key: string;
  name: string;
  city_slug: string;
  city_name: string;
  state: string;
  title: string;
  tagline: string;
  why_now: string;
  vibes: string[];
  best_months: string;
  in_season: boolean;
  season_fit: number;
  event: string | null;
  distance_km: number | null;
  travel_hint: string;
  image: string | null;
  image_credit: string;
  /** Saved for later by this traveler. */
  saved: boolean;
  /** What "Build my trip" starts with when the poster is tapped. */
  build: { city: string; spot: string; interests: string[]; kind: "experience" | "guide" | "package" };
};
export type DiscoverFeed = {
  season: { key: "winter" | "summer" | "monsoon" | "autumn"; label: string; month: string };
  from_city: { slug: string; name: string } | null;
  headline: string;
  subhead: string;
  /** Seven trips: in season first, nearest first, at most two per city. */
  picks: TripPoster[];
  /** True when the copy was written by AI this month. */
  ai: boolean;
};
