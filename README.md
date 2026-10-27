# GoLoc — local travel marketplace (MVP)

Travelers discover verified local **Captains** through reels, build a trip (day experience or a
Normal / Medium / Lavish full-service package), pay in-app, and travel with live tracking, insurance
and SOS. Captains run their own business from their phone. Admins govern everything from a
phone-friendly console.

```
goloc-v2/
├── backend/        Django 5.2 + DRF API, Celery jobs            → every app talks to this
├── mobile-core/    Shared React Native code (@goloc/core)        → API client, auth, UI kit, map, chat, SOS, checkout
├── traveler-mob/   Expo app · Traveler  (Local people. Real places. Safe bookings.)
├── captain-mob/    Expo app · Captain   (Your city. Your business. Your income.)
├── admin-desk/     React (Vite) admin console — mobile-first, works on a phone or a desktop
├── deploy/         nginx config + image (serves media and the admin console)
├── docker-compose.yml   Postgres · Redis · API · Celery worker · Celery beat · nginx
├── traveler-desk/, captain-desk/   Older web apps — frozen, not updated for this API
```

---

## Run it locally (about 5 minutes)

### 1. API

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate                    # Windows  (source .venv/bin/activate on Mac/Linux)
pip install -r requirements.txt
copy .env.example .env                    # then set DEBUG=True and OTP_DEV_FIXED_CODE=123456
python manage.py migrate
python manage.py create_admin 98XXXXXXXX --name "You"   # your admin login
# optional: python manage.py seed_demo   (6 demo Captains)   ·   python manage.py reset_data   (wipe back to empty)
python manage.py runserver 0.0.0.0:8001
python manage.py test apps                # 53 tests
```

Every login code is `123456` while `OTP_DEV_FIXED_CODE=123456` and `DEBUG=True`.

| Who | Phone | App |
|---|---|---|
| Admin | 9876500000 | admin-desk |
| Captains CAP-1001…1006 | 9000000001 … 9000000006 | captain-mob |
| Traveler | any other number | traveler-mob |

### 2. Mobile apps (Expo SDK 58)

```bash
npm install                 # once, from the repo root (npm workspaces)
npm run traveler            # or: npm run captain
```

Scan the QR code with **Expo Go** on a phone on the same Wi-Fi. The app finds the API automatically
(same machine as the bundler, port 8001) — no IP to edit. To point at a server instead, set
`EXPO_PUBLIC_API_URL=https://api.goloc.in/api/v1` before `npm run …`.

Everything works in Expo Go (install the latest Expo Go — it must match SDK 58), except **push notifications**: Expo Go can't receive push
on Android. The in-app notification inbox still works. For real push, make a development build
(`npx eas build --profile development`) and add your EAS project id.

**iPhone:** install **Expo Go** from the App Store and scan the QR code with the iPhone **Camera** app.
Allow *Local Network* access when iOS asks, otherwise the app can't reach your laptop. The iOS
Simulator needs a Mac; on Windows use a real iPhone, or a cloud build (below).

### Desktop (Windows & Mac)

The Traveler and Captain apps also run on desktop computers, from the **same code**. Wide screens
get a left sidebar, centred content, multi-column lists and dialogs instead of bottom sheets.

```bash
npm run traveler:web        # opens http://localhost:8081 in your browser
npm run captain:web         # http://localhost:8082
```

Works in Chrome, Edge, Firefox and Safari, on Windows and macOS. On desktop:
- **Payment** opens in a pop-up window. Allow pop-ups for the site.
- **Share trip** copies the link to the clipboard.
- **Push notifications** don't exist; the in-app notification list does.

To host them, run `npm run build:web` inside `traveler-mob` / `captain-mob`. That produces a `dist/`
folder you can serve from any static host (nginx, Netlify, S3…). Add each site's address to
`CORS_ALLOWED_ORIGINS` on the API.

### 3. Admin console

```bash
cd admin-desk
npm install
npm run dev                 # http://localhost:5176
```

---

## Try the whole flow

1. **Traveler app** → Discover → tap a reel → *Profile* → *Book your trip* → pick date, guests (and tier
   for packages) → *Send request*.
2. **Captain app** (CAP-1001) → Bookings → the request → *Accept*.
3. **Traveler** → booking → *Pay* → the test checkout page → *Pay*. The booking is confirmed, and a
   4-digit trip PIN and insurance policy appear.
4. On the trip day, the **Captain** taps *Start trip with PIN* and enters the traveler's PIN. Both apps
   now share live location. The traveler can *Share trip with family* and press *SOS*.
5. **Admin console** → Safety / SOS → the alert, with live locations and one-tap call numbers →
   Acknowledge / Resolve.
6. **Captain** → *Complete trip*. The net amount lands in Earnings → *Withdraw*.
7. **Admin** → Payouts → *Mark paid* with the UTR. **Traveler** → *Rate your trip*.

To test a trip "today", book today's date, or move a booking's date in `/django-admin/`.

---

## Business rules → where they live

| Rule | Behaviour | Code |
|---|---|---|
| BR-1 City-bound Captains | Captain picks one city; it locks after submission; Admin can move them | `captains/serializers.py` `validate_city_id` |
| BR-2 Payout on completion | Captain's share is credited to the wallet only when the trip completes | `payments/services.py` `credit_trip` |
| BR-3 1-month hold | No activity for 30 days → on hold, offline, payouts paused until Admin releases | `captains/services.py` `apply_inactivity_holds` (Celery beat) |
| BR-4 Time-based refunds | ≥72h 100% · ≥48h 75% · ≥24h 50% · ≥6h 25% · else 0% of fare; insurance refunded if the trip never started; Captain cancel → 100% | `bookings/pricing.py` |
| BR-5 Pay-to-protect | Live tracking and SOS refuse unpaid bookings | `trips/services.py` `ensure_protected` |
| BR-6 Per-booking insurance | ₹49 × guests × days charged, policy `INS-BKG-…` issued on payment | `bookings/pricing.py`, `bookings/services.py` `mark_paid` |
| BR-7 ID lookup | Admin search box takes CAP-, BKG-, PO-, SOS-, TKT- or a phone number | `adminops/views.py` `LookupView` |
| BR-8 Package logistics | Tier inclusions are frozen on the booking; Captain sees "You arrange…" | `ServiceOffer.tier_inclusions`, `Booking.service_snapshot` |
| BR-9 Reels → book | Feed → profile → *Book your trip*; views, profile opens and booking starts are tracked per post | `social/views.py`, traveler `reels.tsx` |
| Revenue R1 / R2 | 18% commission on fare; insurance margin = fee − premium (both shown on the Admin dashboard) | settings `PLATFORM_COMMISSION_PERCENT`, `INSURANCE_*` |

Booking lifecycle:
`requested → accepted (2h to pay) → confirmed (PIN) → in_progress → completed`. Requests expire
after 24 h and unpaid accepts after the payment window; both are handled by a Celery beat job
every 5 minutes. Every change is written to a booking timeline that all three apps show.

Safety and trust details:
- Phone numbers stay hidden until the trip is paid.
- Chat masks numbers and emails until there's a paid booking, which keeps deals on-platform.
- KYC files are stored privately and only admins can open them (each view is audited).
- Every admin action is logged in the audit log.

---

## Production

```bash
cp .env.production.example .env.production      # fill in secrets, Razorpay, Twilio
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production exec api python manage.py create_admin 98XXXXXXXX --name "Ops"
```

This runs Postgres 16, Redis, the API (gunicorn, threaded workers), a Celery worker, Celery beat and
nginx. nginx serves uploads and the admin console at `/` and proxies `/api`, `/pay`, `/t` and
`/django-admin`. Put HTTPS in front of it (a cloud load balancer, Caddy, or certbot) and forward
`X-Forwarded-Proto`. Scale the API with `--scale api=3`.

The API **refuses to start** in production if any of these is true:
- `SECRET_KEY` is missing or a placeholder, or `ALLOWED_HOSTS` is `*`.
- OTP is the console provider.
- Payments are `fake` (unless `ALLOW_FAKE_PAYMENTS=True` for staging).
- Razorpay keys are missing.
- There's no Redis for background jobs.

`manage.py check --deploy` passes (only the optional HSTS preload warning remains).

**Speed at peak:**
- Captain cards, feeds and lists are served from denormalised counters (rating, trips, likes,
  views), so no per-row aggregation.
- Hot indexes cover city/live/status, booking status plus expiry, and feed order.
- Discovery and cities are cached in Redis; the latest live location is kept in Redis, so trip
  polling never touches Postgres.
- Feeds use cursor pagination.
- Push, SMS and housekeeping run in Celery.
- On the phone, React Query serves cached screens instantly and refreshes in the background.
  Captain profiles prefetch on press-in. Reels keep only the visible video player alive.

**Mobile release (works from Windows: EAS builds iOS in the cloud):**
1. `npm i -g eas-cli`, then `eas login`.
2. `eas init` in each app (adds the projectId used for push).
3. Set your real API domain in each app's `eas.json` (`EXPO_PUBLIC_API_URL`).
4. Build:
   - `eas build -p ios --profile preview` installs on registered iPhones.
   - `eas build -p ios --profile production` then `eas submit -p ios` goes to TestFlight / App Store.
   - `eas build -p android --profile production` produces the Play Store bundle.

iOS builds need an Apple Developer account (US$99/year); EAS creates the certificates for you.

Bundle ids are `in.goloc.traveler` and `in.goloc.captain`.

### Before real users

- **Twilio Verify:** set it up for SMS OTP. India needs DLT sender registration, which takes a few days.
- **AI (Groq or Claude):** set `GROQ_API_KEY` (used first; model `openai/gpt-oss-120b`) or `ANTHROPIC_API_KEY` (`claude-opus-5-5`) in `backend/.env`; `AI_PROVIDER=groq|anthropic` chooses when both are set. This powers AI itineraries and posters, and the ✨ AI button on text fields ("Edit with AI": improve, shorten, translate, or any instruction). Without a key, itineraries use a fill-in template and the AI buttons are hidden.
- **Razorpay:** create keys and a webhook (`payment.captured`, `payment.failed`). Test keys work end
  to end with no real money.
- **Emergency directory:** add verified local police stations and hospitals per city (Admin → Cities
  & emergency). Only national numbers (112, 100, 108, 1091, tourist helpline, 101) are seeded; we
  don't ship unverified local numbers.
- **Insurance:** the per-booking fee and premium are configurable, but no insurer API is connected
  yet. Policies are recorded as `INS-<booking>` for reconciliation with your insurance partner.
- **Payouts:** payouts are marked paid manually with a UTR. RazorpayX automation is a natural next
  step.

---

## API map (`/api/v1/`)

| Area | Endpoints |
|---|---|
| Auth | `auth/otp/request/` · `auth/otp/verify/` · `auth/token/refresh/` · `auth/logout/` · `auth/me/` · `auth/traveler-profile/` |
| Captain self | `captain/profile/` (+`avatar/`) · `checklist/` · `submit/` · `go-live/` · `dashboard/` · `services/` · `vehicles/` · `documents/` · `availability/` (+`blocked/`) · `payout-account/` |
| Discovery | `captains/` (filters: city, category, kind, language, q, sort) · `captains/<id or CAP-code>/` · `…/calendar/` · `captains/services/<id>/` · `captains/quote/` · `captains/match/` (Build My Trip) · `captains/saved/` |
| Bookings | `bookings/` · `bookings/<id or BKG-code>/` · `…/accept|decline|cancel|start|complete/` · `…/cancel-preview/` |
| Payments | `payments/bookings/<ref>/order/` · `payments/verify/` · `payments/webhooks/razorpay/` · `payments/wallet/` · `payments/payouts/` · pages `/pay/checkout/<token>/` |
| Trips & SOS | `trips/<ref>/location/` · `trips/<ref>/live/` · `trips/<ref>/sos/` · `trips/emergency/` · `trips/shared/<token>/` · page `/t/<token>/` |
| Social | `social/feed/` · `social/posts/<id>/like/` · `…/event/` · `social/mine/` (+`insights/`) |
| Chat | `chat/` · `chat/<id>/messages/?after=<id>` |
| Reviews | `reviews/` · `reviews/mine/` · `reviews/<id>/reply/` · `reviews/captains/<id>/` |
| Notifications | `notifications/` · `unread/` · `read/` · `devices/` |
| Support | `support/tickets/` |
| Admin | `admin/dashboard/` · `lookup/` · `captains/…` · `documents/…` · `bookings/…` · `payments/` · `refunds/` · `payouts/…` · `sos/…` · `tickets/…` · `reviews/…` · `posts/…` · `users/…` · `cities/…` · `emergency/…` · `audit/` |

Every error has the same shape: `{"detail", "code", "fields"?, "retry_after"?}`.
Tokens carry the app role, so a Traveler token can't call Captain or Admin endpoints.
