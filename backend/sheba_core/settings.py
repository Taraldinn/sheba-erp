from pathlib import Path
import environ
import os

# ─── Base directory ──────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Load environment variables from .env file ───────────────────────────────
env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ['localhost', '127.0.0.1']),
    CORS_ALLOWED_ORIGINS=(list, ['http://localhost:3000', 'http://127.0.0.1:3000']),
    CORS_ALLOW_ALL_ORIGINS=(bool, False),
    DATABASE_URL=(str, f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
    REDIS_URL=(str, ''),
    LOG_LEVEL=(str, 'INFO'),
)

# Read .env if present (dev convenience — production injects vars via shell/docker)
environ.Env.read_env(BASE_DIR / '.env', overwrite=False)

# ─── Core security ───────────────────────────────────────────────────────────
SECRET_KEY = env('SECRET_KEY', default='django-insecure-sheba-erp-development-key-change-in-prod-xyz123')
DEBUG = env('DEBUG')
ALLOWED_HOSTS = env('ALLOWED_HOSTS')

# ─── Installed apps ──────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party packages
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'drf_spectacular',
    'whitenoise.runserver_nostatic',   # serve compressed statics in dev too

    # Sheba ISP Core Apps
    'apps.core',
    'apps.authentication',
    'apps.customers',
    'apps.billing',
    'apps.payments',
    'apps.network',
    'apps.support',
    'apps.hr',
    'apps.store',
    'apps.tasks',
    'apps.callcenter',
    'apps.reports',
]

# ─── Middleware ───────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',          # P1.5 — static serving
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.core.middleware.TenantResolutionMiddleware',
]

ROOT_URLCONF = 'sheba_core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'sheba_core.wsgi.application'

# ─── Database ─────────────────────────────────────────────────────────────────
# In production set DATABASE_URL=postgres://user:pass@host:5432/dbname
DATABASES = {
    'default': env.db('DATABASE_URL', default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")
}

# ─── Password validation ──────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─── Internationalization ─────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Dhaka'
USE_I18N = True
USE_TZ = True

# ─── Static & Media ──────────────────────────────────────────────────────────
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# P1.5 — WhiteNoise: serve gzipped + br compressed static files
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Django REST Framework ────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'rest_framework.views.exception_handler',
}

# ─── Swagger / OpenAPI ────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    'TITLE': 'Sheba ISP ERP API',
    'DESCRIPTION': 'Next-Gen Multi-Tenant ISP ERP, MikroTik / OLT Automation, Subscriber Billing & CRM API Engine',
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SWAGGER_UI_SETTINGS': {
        'deepLinking': True,
        'persistAuthorization': True,
        'displayOperationId': False,
        'docExpansion': 'list',
        'filter': True,
        'tagsSorter': 'alpha',
    },
    'TAGS': [
        {'name': '1. Authentication & Users', 'description': 'User login, token generation, active session, and staff profiles.'},
        {'name': '2. Customers & Subscribers', 'description': 'Subscriber lifecycle, PPPoE credentials, internet toggle on/off, and recharges.'},
        {'name': '3. Broadband Packages & Offers', 'description': 'Bandwidth tiers, MikroTik simple queue profiles, special discounts, and reseller margins.'},
        {'name': '4. Network & Core Routers', 'description': 'MikroTik RouterOS sync, PPPoE active tunnels, live bandwidth telemetry, and POP branches.'},
        {'name': '5. OLT & Optical ONUs', 'description': 'GPON / EPON chassis management, optical RX power diagnostics, and remote ONU reboot.'},
        {'name': '6. Billing & Invoices', 'description': 'Automated monthly recurring invoices, payment collection ledger, and reseller pricing.'},
        {'name': '7. Payments & SMS Gateways', 'description': 'bKash/Nagad gateways, webhook transaction ingestion, and SMS parsers.'},
        {'name': '8. Support Desk & NOC Tickets', 'description': 'Incident reports, optical losses, technician dispatch, and staff reply threads.'},
        {'name': '9. Field Tasks & Maintenance', 'description': 'Work orders, field technician assignments, and repair queues.'},
        {'name': '10. HR & Payroll Management', 'description': 'Employees, daily attendance, leave requests, advance salaries, and payroll records.'},
        {'name': '11. Store & Fiber Inventory', 'description': 'Hardware store catalog, drop cables, SFP transceivers, and stock transactions.'},
        {'name': '12. Call Center & Voice Reminders', 'description': 'Call logs, IVR voice templates, and automated bill payment voice reminder broadcasts.'},
        {'name': '13. Reports & Analytics', 'description': 'Real-time aggregated KPIs, revenue trends, and bandwidth distribution.'},
        {'name': '14. Core & Tenant Settings', 'description': 'Multi-tenant organization profiles, company branding, audit logs, and health checks.'},
    ],
}

# ─── CORS ─────────────────────────────────────────────────────────────────────
# In production: CORS_ALLOW_ALL_ORIGINS=False  CORS_ALLOWED_ORIGINS=https://app.myisp.com
CORS_ALLOW_ALL_ORIGINS = env('CORS_ALLOW_ALL_ORIGINS')
CORS_ALLOWED_ORIGINS = env('CORS_ALLOWED_ORIGINS')
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'authorization',
    'content-type',
    'x-tenant-id',
    'x-tenant-key',
    'x-signature',
    'x-timestamp',
    'accept',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# ─── Cache & Session Backend (Redis / Stateless LB) ─────────────────────────
REDIS_URL = env('REDIS_URL')
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
        }
    }
    SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
    SESSION_CACHE_ALIAS = 'default'

# ─── Security headers (active in production, no-op in DEBUG) ─────────────────
if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = env.bool('SECURE_SSL_REDIRECT', default=True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    X_FRAME_OPTIONS = 'DENY'

# ─── Logging ──────────────────────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': env('LOG_LEVEL'),
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': env('LOG_LEVEL'),
            'propagate': False,
        },
    },
}
