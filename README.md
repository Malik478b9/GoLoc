# GoLoc — Codebase

Starter implementation of the GoLoc local-travel marketplace, generated from
the `GoLoc Technical Project Specification v1.0`. This is a working
**Phase 0–2 scaffold** (Section 6.1 of that spec) — the foundation, business
rules, and core screens are real and verified; a dev team picks this up from
here rather than starting blank.

## What's in here

```
goloc/
├── backend/      Django + DRF + Channels API (Section 3: Backend / Database / Real-time)
├── mobile/       React Native (Expo) app — Traveler + Captain, one codebase
└── admin-web/    React admin console — Command Center, verification, disputes
```

## What's implemented vs. what's next

| Layer | Implemented | Next up |
|---|---|---|
| Backend | All 12 apps, full model graph, JWT+OTP auth, business rules BR-1–BR-9 as real code, Razorpay+Route, Cloudflare Stream, Channels (chat/live-trip/SOS), Celery hold-sweep task | Wire real Cloudflare R2/Azure Blob storage backends, write the test suite, add DRF throttling/rate limits, staff-only Captain admin endpoint (see note in `admin-web/src/api/client.ts`) |
| Mobile | Role-based navigation, OTP login, Discover/reels feed, Captain profile, Build My Trip + Razorpay Checkout, My Bookings + cancellation, Live Trip map + SOS, chat, full Captain side (dashboard/verification/pricing/availability/requests/earnings) | Push notification handling (FCM token registration is server-ready, client wiring is not), offline states, app icons/splash, TestFlight/Play Internal builds |
| Admin web | Command Center dashboard, Captain search, BKG-ID lookup (BR-7), Incidents queue, Disputes resolution | Admin login screen (currently assumes a token is already in `localStorage`), Users/Cities/Content-moderation pages, Payments/Payouts/Reconciliation page, Promotions management |

Every file that implements a specific business rule or spec section has a
comment citing it (e.g. `# BR-4: Time-based refunds`, `// Section 3.2 step 2`)
— search for `BR-` or `Section` to trace code back to the spec.

## Verified before delivery

- `python manage.py check` — passes, 0 issues
- `python manage.py makemigrations` — generates cleanly for all 12 apps (migrations are committed)
- Mobile: `npm install && npx tsc --noEmit` — 0 type errors
- Admin web: `npm install && npx tsc --noEmit && npx vite build` — builds clean

## Getting the backend running locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in Razorpay/Twilio/Cloudflare/etc. keys as you get them
# Requires local Postgres + Redis, e.g.:
#   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=goloc -e POSTGRES_USER=goloc -e POSTGRES_DB=goloc postgres:16
#   docker run -d -p 6379:6379 redis:7
python manage.py migrate
python manage.py createsuperuser
daphne goloc.asgi:application   # ASGI server — required for Channels (chat/live-trip/SOS)
# in a second terminal, for the BR-3 hold-sweep job:
celery -A goloc worker -B -l info
```

The API is versioned under `/api/v1/`; see `goloc/urls.py` for the full route
map, one `include()` per app.

## Getting the mobile app running locally

```bash
cd mobile
npm install
# point src/api/client.ts API_BASE_URL / WS_BASE_URL at your local backend
npx expo start
```

Requires the Expo Go app (or a dev build) on a device/simulator. Razorpay
Checkout (`react-native-razorpay`) needs a native build (`expo prebuild`) —
it will not run inside Expo Go.

## Getting the admin console running locally

```bash
cd admin-web
npm install
# point src/api/client.ts API_BASE_URL at your local backend
npm run dev
```

## Where the business rules live

All nine rules from Section 2.4 of the spec are implemented as code, not
just documented:

| Rule | File |
|---|---|
| BR-1 City-bound Captains | `backend/apps/captains/models.py`, `views.py` (`CaptainDiscoveryViewSet`) |
| BR-2 Payout on completion | `backend/apps/bookings/services.py` (`complete_booking`) |
| BR-3 1-month hold | `backend/apps/captains/tasks.py` (`sweep_inactive_captains`, Celery beat) |
| BR-4 Time-based refunds | `backend/apps/bookings/services.py` (`calculate_refund_percentage`, `cancel_booking`) |
| BR-5 Pay-to-protect | `backend/apps/bookings/services.py` (`mark_booking_paid`), `backend/apps/safety/consumers.py` (refuses the socket if `sos_active` is false) |
| BR-6 Per-booking insurance | `backend/apps/bookings/models.py` (`Booking.insurance_amount`), `serializers.py` |
| BR-7 ID lookup | `backend/apps/bookings/views.py` (`BookingLookupView`), `admin-web/src/pages/Bookings.tsx` |
| BR-8 Package logistics | `backend/apps/captains/models.py` (`PackageLineItem`), `backend/apps/bookings/models.py` (`PackageBookingLineItem`) |
| BR-9 Reels → book funnel | `backend/apps/content/views.py` (`track_view`/`track_profile_open`/`track_booking_start`), mobile `DiscoverScreen.tsx` → `CaptainProfileScreen.tsx` → `BuildMyTripScreen.tsx` |

## External dependencies to line up before a real pilot

Per Section 8 of the spec:

1. **Razorpay Route marketplace onboarding** — start this first; it has the longest lead time.
2. **Insurance partner** — BR-5/BR-6 assume a licensed insurer/broker relationship; this is a business dependency, not something this codebase can stand in for.
3. **Cloudflare account** (Stream + R2) and **Azure subscription** (Postgres, Redis, Blob, App Service/AKS).
4. **Apple Developer Program** + **Google Play Console** accounts for store submission.
