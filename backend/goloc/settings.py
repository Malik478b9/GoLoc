"""
GoLoc backend settings.

Everything environment-specific comes from environment variables (or a
local `.env` file read by python-decouple). Defaults are *safe for
production*: DEBUG is off unless you turn it on, and the app refuses to
boot in production with a placeholder SECRET_KEY or an open ALLOWED_HOSTS.

See `.env.example` for every variable and what it does.
"""
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _bool(value) -> bool:
    # Some tools set DEBUG to a build channel such as "release"; anything that
    # isn't an explicit truthy value is treated as False (production).
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


DEBUG = config("DEBUG", default=False, cast=_bool)

_DEV_SECRET = "dev-insecure-secret-key-do-not-use-in-production"
SECRET_KEY = config("SECRET_KEY", default=_DEV_SECRET if DEBUG else "")
if not DEBUG and (not SECRET_KEY or SECRET_KEY in {_DEV_SECRET, "change-me", "dev-secret-key-change-me"}):
    raise ImproperlyConfigured("Set a strong SECRET_KEY environment variable before running with DEBUG=False.")

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1,0.0.0.0,*" if DEBUG else "",
    cast=Csv(),
)
if not DEBUG and (not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS):
    raise ImproperlyConfigured("Set ALLOWED_HOSTS to your real domain(s) when DEBUG=False (no '*').")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.common",
    "apps.cities",
    "apps.accounts",
    "apps.captains",
    "apps.bookings",
    "apps.payments",
    "apps.trips",
    "apps.social",
    "apps.chat",
    "apps.reviews",
    "apps.notifications",
    "apps.support",
    "apps.adminops",
    "apps.itineraries",
    "apps.assist",
    "apps.discover",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "goloc.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "goloc.wsgi.application"
AUTH_USER_MODEL = "accounts.User"

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
DATABASE_ENGINE = config("DATABASE_ENGINE", default="sqlite").lower()

if DATABASE_ENGINE == "postgresql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("POSTGRES_DB", default="goloc"),
            "USER": config("POSTGRES_USER", default="postgres"),
            "PASSWORD": config("POSTGRES_PASSWORD", default=""),
            "HOST": config("POSTGRES_HOST", default="localhost"),
            "PORT": config("POSTGRES_PORT", default="5432"),
            "CONN_MAX_AGE": config("DB_CONN_MAX_AGE", default=60, cast=int),
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"sslmode": config("POSTGRES_SSLMODE", default="prefer")},
        }
    }
elif DATABASE_ENGINE == "sqlite":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
else:
    raise ImproperlyConfigured("DATABASE_ENGINE must be either 'sqlite' or 'postgresql'.")

# --------------------------------------------------------------------------
# Cache (used by API rate limiting). Use Redis in production so limits are
# shared across all gunicorn workers / servers.
# --------------------------------------------------------------------------
REDIS_URL = config("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}}
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "goloc"}}

# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework_simplejwt.authentication.JWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_RENDERER_CLASSES": (
        ("rest_framework.renderers.JSONRenderer", "rest_framework.renderers.BrowsableAPIRenderer")
        if DEBUG
        else ("rest_framework.renderers.JSONRenderer",)
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",  # only views that set throttle_scope
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": config("THROTTLE_ANON", default="120/min"),
        "user": config("THROTTLE_USER", default="600/min"),
        # Per-IP ceilings on the OTP endpoints. Generous on purpose: Indian
        # mobile carriers put many people behind one IP (CGNAT). The real
        # protection is the per-phone limits in OTP_* below.
        "otp_request": config("THROTTLE_OTP_REQUEST", default="30/hour"),
        "otp_verify": config("THROTTLE_OTP_VERIFY", default="60/hour"),
        "location": config("THROTTLE_LOCATION", default="30/min"),
        "chat": config("THROTTLE_CHAT", default="40/min"),
        "upload": config("THROTTLE_UPLOAD", default="30/hour"),
        "booking_request": config("THROTTLE_BOOKING_REQUEST", default="20/hour"),
        "itinerary_ai": config("THROTTLE_ITINERARY_AI", default="30/hour"),
        "ai_assist": config("THROTTLE_AI_ASSIST", default="120/hour"),
    },
    "EXCEPTION_HANDLER": "apps.accounts.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=config("JWT_ACCESS_MINUTES", default=30, cast=int)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=config("JWT_REFRESH_DAYS", default=30, cast=int)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "SIGNING_KEY": config("JWT_SIGNING_KEY", default=SECRET_KEY),
}

# --------------------------------------------------------------------------
# OTP login
# --------------------------------------------------------------------------
# Provider: "console" logs the code (development only), "twilio_verify"
# sends a real SMS through Twilio Verify.
OTP_PROVIDER = config("OTP_PROVIDER", default="console" if DEBUG else "twilio_verify")
if not DEBUG and OTP_PROVIDER == "console":
    raise ImproperlyConfigured("OTP_PROVIDER=console is development-only. Use twilio_verify in production.")

OTP_LENGTH = 6
OTP_TTL_SECONDS = config("OTP_TTL_SECONDS", default=300, cast=int)              # code valid for 5 min
OTP_RESEND_COOLDOWN_SECONDS = config("OTP_RESEND_COOLDOWN_SECONDS", default=30, cast=int)
OTP_MAX_SENDS_PER_HOUR = config("OTP_MAX_SENDS_PER_HOUR", default=5, cast=int)  # per phone number
OTP_MAX_ATTEMPTS = config("OTP_MAX_ATTEMPTS", default=5, cast=int)              # wrong guesses per code
OTP_DEFAULT_COUNTRY_CODE = config("OTP_DEFAULT_COUNTRY_CODE", default="91")
# Development conveniences — both are ignored when DEBUG=False.
OTP_DEV_FIXED_CODE = config("OTP_DEV_FIXED_CODE", default="") if DEBUG else ""
OTP_EXPOSE_CODE_IN_RESPONSE = DEBUG and config("OTP_EXPOSE_CODE_IN_RESPONSE", default=True, cast=_bool)

TWILIO_ACCOUNT_SID = config("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN = config("TWILIO_AUTH_TOKEN", default="")
TWILIO_VERIFY_SERVICE_SID = config("TWILIO_VERIFY_SERVICE_SID", default="")
if OTP_PROVIDER == "twilio_verify" and not DEBUG and not all(
    [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID]
):
    raise ImproperlyConfigured("Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID.")

# --------------------------------------------------------------------------
# CORS — which web frontends may call this API from a browser.
# (Native mobile apps don't use CORS.)
# --------------------------------------------------------------------------
# Dev: the web desks (5174-5176) and the Traveler/Captain apps in a desktop browser (Expo web, 8081+).
_DEV_ORIGINS = ",".join(
    f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5174, 5175, 5176, 8081, 8082, 8083, 19006)
)
# An empty value in .env means "use the dev defaults" (DEBUG only), not "allow nothing".
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv()) or (_DEV_ORIGINS.split(",") if DEBUG else [])
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

# --------------------------------------------------------------------------
# Security headers (production)
# --------------------------------------------------------------------------
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=_bool)
    SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/$"]  # load balancer health checks hit plain HTTP
    SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30, cast=int)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = config("MEDIA_URL", default="/media/")
MEDIA_ROOT = Path(config("MEDIA_ROOT", default=str(BASE_DIR / "media")))
# Uploads stream to disk above this size instead of being held in memory.
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# S3 / Cloudflare R2 / any S3-compatible store: set AWS_STORAGE_BUCKET_NAME.
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
if AWS_STORAGE_BUCKET_NAME:
    _DEFAULT_STORAGE = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": AWS_STORAGE_BUCKET_NAME,
            "endpoint_url": config("AWS_S3_ENDPOINT_URL", default="") or None,
            "region_name": config("AWS_S3_REGION_NAME", default="ap-south-1"),
            "custom_domain": config("AWS_S3_CUSTOM_DOMAIN", default="") or None,
            "querystring_auth": False,
            "file_overwrite": False,
            "object_parameters": {"CacheControl": "public, max-age=31536000, immutable"},
        },
    }
    # KYC documents: same bucket, separate prefix, short-lived signed URLs only.
    _PRIVATE_STORAGE = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {**_DEFAULT_STORAGE["OPTIONS"], "location": "private", "custom_domain": None,
                    "querystring_auth": True, "querystring_expire": 300, "default_acl": "private"},
    }
else:
    _DEFAULT_STORAGE = {"BACKEND": "django.core.files.storage.FileSystemStorage"}
    # Outside MEDIA_ROOT, so it's never served by the public /media/ route.
    _PRIVATE_STORAGE = {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": str(Path(config("PRIVATE_MEDIA_ROOT", default=str(BASE_DIR / "private_media"))))},
    }

STORAGES = {
    "default": _DEFAULT_STORAGE,
    "private": _PRIVATE_STORAGE,
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------
# Marketplace rules (spec v1.5). Amounts in whole rupees.
# --------------------------------------------------------------------------
# Public address of this API, used in links opened outside the app
# (payment checkout page, "share my trip" link).
# Empty = use the host the app called us on (works for phones on the LAN in development).
PUBLIC_BASE_URL = config("PUBLIC_BASE_URL", default="").rstrip("/")

PLATFORM_COMMISSION_PERCENT = config("PLATFORM_COMMISSION_PERCENT", default=18, cast=int)   # R1
INSURANCE_FEE_PER_GUEST_DAY = config("INSURANCE_FEE_PER_GUEST_DAY", default=49, cast=int)    # BR-6, charged
INSURANCE_PREMIUM_PER_GUEST_DAY = config("INSURANCE_PREMIUM_PER_GUEST_DAY", default=29, cast=int)  # our cost
REQUEST_EXPIRY_HOURS = config("REQUEST_EXPIRY_HOURS", default=24, cast=int)     # Captain must answer within
PAYMENT_WINDOW_MINUTES = config("PAYMENT_WINDOW_MINUTES", default=120, cast=int)  # Traveler must pay within
BOOKING_MAX_DAYS_AHEAD = config("BOOKING_MAX_DAYS_AHEAD", default=180, cast=int)
GUIDE_MAX_DAYS = config("GUIDE_MAX_DAYS", default=30, cast=int)  # longest single guide hire, arrival → return

# AI (itineraries, "Edit with AI"). Groq is used when its key is set, else Claude; with neither,
# Captains get a fill-in itinerary template and the AI buttons are hidden. See apps/common/llm.py.
GROQ_API_KEY = config("GROQ_API_KEY", default="")
ANTHROPIC_API_KEY = config("ANTHROPIC_API_KEY", default="")
AI_PROVIDER = config("AI_PROVIDER", default="")  # "groq" | "anthropic" to choose when both keys are set
# Run itinerary generation in the request thread (tests). Otherwise: Celery, or a background thread when there is no broker.
ITINERARY_SYNC = config("ITINERARY_SYNC", default=False, cast=bool)
CAPTAIN_INACTIVITY_HOLD_DAYS = config("CAPTAIN_INACTIVITY_HOLD_DAYS", default=30, cast=int)  # BR-3
MIN_PAYOUT_AMOUNT = config("MIN_PAYOUT_AMOUNT", default=500, cast=int)
# BR-4: (at least this many hours before start, % of fare refunded). First match wins.
REFUND_SCHEDULE = [(72, 100), (48, 75), (24, 50), (6, 25), (0, 0)]

# --------------------------------------------------------------------------
# Payments — "fake" works end to end without keys; "razorpay" for real money.
# --------------------------------------------------------------------------
PAYMENT_GATEWAY = config("PAYMENT_GATEWAY", default="fake")
RAZORPAY_KEY_ID = config("RAZORPAY_KEY_ID", default="")
RAZORPAY_KEY_SECRET = config("RAZORPAY_KEY_SECRET", default="")
RAZORPAY_WEBHOOK_SECRET = config("RAZORPAY_WEBHOOK_SECRET", default="")
ALLOW_FAKE_PAYMENTS = DEBUG or config("ALLOW_FAKE_PAYMENTS", default=False, cast=_bool)  # staging only
if PAYMENT_GATEWAY == "fake" and not ALLOW_FAKE_PAYMENTS:
    raise ImproperlyConfigured("PAYMENT_GATEWAY=fake is for development. Set razorpay keys (or ALLOW_FAKE_PAYMENTS=True on staging).")
if PAYMENT_GATEWAY == "razorpay" and not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
    raise ImproperlyConfigured("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")

# Push: "expo" sends through Expo's push service (no keys needed); "log" only logs.
PUSH_PROVIDER = config("PUSH_PROVIDER", default="log" if DEBUG else "expo")

# --------------------------------------------------------------------------
# Background jobs (Celery). Without a broker, tasks run inline — fine for a
# laptop, never for production.
# --------------------------------------------------------------------------
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_TASK_ALWAYS_EAGER = not CELERY_BROKER_URL
CELERY_TASK_EAGER_PROPAGATES = False
CELERY_TASK_IGNORE_RESULT = True
CELERY_TIMEZONE = "Asia/Kolkata"
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 4
CELERY_BEAT_SCHEDULE = {
    "expire-stale-bookings": {"task": "apps.bookings.tasks.expire_stale_bookings", "schedule": 300.0},
    "captain-inactivity-holds": {"task": "apps.captains.tasks.apply_inactivity_holds", "schedule": 6 * 3600.0},
    "prune-location-pings": {"task": "apps.trips.tasks.prune_pings", "schedule": 24 * 3600.0},
}
if not DEBUG and CELERY_TASK_ALWAYS_EAGER:
    raise ImproperlyConfigured("Set REDIS_URL (or CELERY_BROKER_URL) in production so background jobs run.")

# --------------------------------------------------------------------------
# Logging — plain lines to stdout; your host (Docker, Render, Azure, …)
# collects them.
# --------------------------------------------------------------------------
LOG_LEVEL = config("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.request": {"level": "WARNING"},
        "goloc": {"level": LOG_LEVEL, "propagate": True},
    },
}
