from pathlib import Path
import environ
import os
import sys

# ─── Base directory ──────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Load environment variables from .env file ───────────────────────────────
env = environ.Env(
    ENVIRONMENT=(str, 'local'),
    DEBUG=(bool, True),
    ALLOWED_HOSTS=(list, ['*']),
    CORS_ALLOWED_ORIGINS=(list, ['http://localhost:3000', 'http://127.0.0.1:3000']),
    CORS_ALLOW_ALL_ORIGINS=(bool, True),
    CSRF_TRUSTED_ORIGINS=(list, []),
    DATABASE_URL=(str, f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
    REDIS_URL=(str, ''),
    LOG_LEVEL=(str, 'INFO'),
)

# Read .env if present (dev convenience — production injects vars via shell/docker)
environ.Env.read_env(BASE_DIR / '.env', overwrite=False)

# ─── Environment switch: 'local' vs 'production' ─────────────────────────────
ENVIRONMENT = env('ENVIRONMENT').lower()
IS_PRODUCTION = ENVIRONMENT in ('production', 'prod')
IS_LOCAL = not IS_PRODUCTION

# ─── Core security ───────────────────────────────────────────────────────────
SECRET_KEY = env('SECRET_KEY', default='django-insecure-sheba-erp-development-key-change-in-prod-xyz123')

if IS_LOCAL:
    DEBUG = env.bool('DEBUG', default=True)
    ALLOWED_HOSTS = ['*']
    CORS_ALLOW_ALL_ORIGINS = True
    CORS_ALLOWED_ORIGINS = ['*']
else:
    DEBUG = env.bool('DEBUG', default=False)
    ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])
    CORS_ALLOW_ALL_ORIGINS = env.bool('CORS_ALLOW_ALL_ORIGINS', default=False)
    CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[])

CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])

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
    'apps.finance',     # Financial ledger, billing accounts, idempotency (Phase E/F/34)
]

# Development-only SSL server (only if installed and DEBUG is enabled)
if DEBUG:
    try:
        import sslserver  # noqa: F401
        INSTALLED_APPS.append('sslserver')
    except ImportError:
        pass

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

if 'test' in sys.argv:
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
    PASSWORD_HASHERS = [
        'django.contrib.auth.hashers.MD5PasswordHasher',
    ]
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
    CELERY_BROKER_URL = 'memory://'
    CELERY_RESULT_BACKEND = 'cache+memory://'

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
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': env('THROTTLE_ANON_RATE', default='100/minute'),
        'user': env('THROTTLE_USER_RATE', default='1000/minute'),
        'auth': env('THROTTLE_AUTH_RATE', default='30/minute'),
        'webhooks': env('THROTTLE_WEBHOOK_RATE', default='300/minute'),
        'recharge': env('THROTTLE_RECHARGE_RATE', default='60/minute'),
    },
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'rest_framework.views.exception_handler',
}

# ─── Swagger / OpenAPI ────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    'TITLE': 'ShebaFi ISP ERP & SaaS Control Plane API',
    'DESCRIPTION': (
        'Production-grade, Multi-Tenant ISP Operations, MikroTik/OLT Automation, '
        'Double-Entry Financial Ledgers, Hierarchical Network Topology & Impact Analysis, '
        'Customer Self-Care Portal, and SaaS Global Control Plane.'
    ),
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SWAGGER_UI_SETTINGS': {
        'deepLinking': True,
        'persistAuthorization': True,
        'displayOperationId': False,
        'docExpansion': 'none',
        'filter': True,
        'tagsSorter': 'alpha',
        'tryItOutEnabled': True,
        'syntaxHighlight': {
            'activate': True,
            'theme': 'monokai',
        },
    },
    'REDOC_UI_SETTINGS': {
        'expandResponses': 'all',
        'hideDownloadButton': False,
        'pathInMiddlePanel': True,
        'requiredPropsFirst': True,
        'sortPropsAlphabetically': True,
        'theme': {
            'colors': {
                'primary': {
                    'main': '#4f46e5',
                },
                'success': {
                    'main': '#10b981',
                },
                'warning': {
                    'main': '#f59e0b',
                },
                'error': {
                    'main': '#ef4444',
                },
            },
            'typography': {
                'fontFamily': 'Inter, system-ui, -apple-system, sans-serif',
                'headings': {
                    'fontFamily': 'Inter, system-ui, -apple-system, sans-serif',
                },
            },
        },
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
        {'name': '15. Network Operations, Topology & Impact Analysis', 'description': 'Hierarchical hardware topology tree, live drill-downs, and blast-radius failure impact simulations.'},
        {'name': '16. Multi-Tenant SaaS & Control Plane', 'description': 'Global central control plane, tenant provisioning, subscription packages, and cross-tenant overview.'},
        {'name': '17. Customer Self-Care Portal', 'description': 'Subscriber self-service portal, usage stats, online payments, and support ticketing.'},
        {'name': '18. Financial Reconciliations & Ledgers', 'description': 'Double-entry ledger journal, advance credit adjustments, compensating reversals, and reconciliation audits.'},
        {'name': '19. Production Readiness & Observability Probes', 'description': 'Comprehensive production readiness verification, database latencies, Redis lock safety, and disaster recovery status.'},
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
    'idempotency-key',
    'accept',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# ─── Security Headers ────────────────────────────────────────────────────────
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'

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

# ─── Reverse Proxy & Security Configuration ──────────────────────────────────
if IS_PRODUCTION and not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    USE_X_FORWARDED_HOST = True
    USE_X_FORWARDED_PORT = True
    SECURE_HSTS_SECONDS = env.int('SECURE_HSTS_SECONDS', default=0)
    if SECURE_HSTS_SECONDS > 0:
        SECURE_HSTS_INCLUDE_SUBDOMAINS = True
        SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = env.bool('SECURE_SSL_REDIRECT', default=False)
    SECURE_REDIRECT_EXEMPT = [r'^$', r'^healthz/?', r'^api/v1/health-check/?', r'^api/docs/?']
    SESSION_COOKIE_SECURE = env.bool('SESSION_COOKIE_SECURE', default=False)
    CSRF_COOKIE_SECURE = env.bool('CSRF_COOKIE_SECURE', default=False)
else:
    # Local development mode: completely permissive, zero SSL redirects, zero HSTS
    SECURE_SSL_REDIRECT = False
    SECURE_HSTS_SECONDS = 0
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False

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

# ─── Celery & Redis Configuration (Stage 4) ──────────────────────────────────
REDIS_URL = env('REDIS_URL')

if 'test' not in sys.argv and REDIS_URL:
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = REDIS_URL

CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'expire_customers_daily': {
        'task': 'apps.core.tasks.expire_customers',
        'schedule': crontab(hour=0, minute=0),
        'args': (),
    },
    'generate_monthly_invoices_monthly': {
        'task': 'apps.core.tasks.generate_monthly_invoices',
        'schedule': crontab(day_of_month=1, hour=1, minute=0),
        'args': (),
    },
    'reconcile_payments_hourly': {
        'task': 'apps.core.tasks.reconcile_payments',
        'schedule': crontab(minute=30),
        'args': (),
    },
    # Stage 13.3 — auto-suspend tenants whose subscription has expired.
    # Runs daily at 00:30, staggered 30 min after expire_customers to avoid lock contention.
    'enforce_subscription_lifecycle_daily': {
        'task': 'apps.core.tasks.enforce_subscription_lifecycle',
        'schedule': crontab(hour=0, minute=30),
        'args': (),
    },
}

if 'test' in sys.argv:
    REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = []
