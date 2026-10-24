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

export type ServiceKind = "experience" | "package";
export type Tier = "standard" | "normal" | "medium" | "lavish";

export type Service = {
  id: string;
  kind: ServiceKind;
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
  city_name: string;
  city_slug: string;
  languages: string[];
  categories: string[];
  years_experience: number;
  rating_avg: string;
  rating_count: number;
  trips_completed: number;
  is_featured: boolean;
  from_price: number | null;
  has_package: boolean;
  saved?: boolean;
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
  traveler: { id: string; name: string; phone?: string };
  city_name: string;
  fare: number;
  total: number;
  captain_net?: number;
  request_expires_at: string | null;
  payment_due_at: string | null;
  created_at: string;
};

export type BookingDetail = Booking & {
  service_id: string;
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
  actions: Partial<Record<"accept" | "decline" | "cancel" | "start" | "complete" | "track" | "pay" | "sos" | "review" | "message", boolean>>;
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
