# ==============================================================================
# Sheba ERP Backend - Multi-Context Production Dockerfile
# Supports two build contexts seamlessly:
#   1. context = repo root      (Dokploy default application deployment)
#   2. context = ./backend      (Dokploy Compose / docker compose deployment)
# ==============================================================================

# ==============================================================================
# Stage 0: Context Resolver
# Normalizes files so /src always contains the backend application tree
# ==============================================================================
FROM alpine:latest AS context-resolver

WORKDIR /src
COPY . /context/

RUN if [ -f /context/backend/requirements.txt ]; then \
        echo "Detected repository root context. Copying backend files..."; \
        cp -a /context/backend/. /src/; \
    elif [ -f /context/requirements.txt ]; then \
        echo "Detected ./backend context. Copying files..."; \
        cp -a /context/. /src/; \
    else \
        echo "Error: requirements.txt not found in build context!" && exit 1; \
    fi && \
    rm -rf /src/.git /src/__pycache__ /src/*/__pycache__ /src/*/*/__pycache__

# ==============================================================================
# Stage 1: Build dependencies
# ==============================================================================
FROM python:3.12-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install build dependencies for C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python packages into user directory
COPY --from=context-resolver /src/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

# ==============================================================================
# Stage 2: Production runtime
# ==============================================================================
FROM python:3.12-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    WEB_CONCURRENCY=3 \
    RUN_MIGRATIONS=true \
    PATH="/home/appuser/.local/bin:$PATH"

# Install runtime libraries (libpq for PostgreSQL, curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root user and group
RUN groupadd -r -g 1001 appuser && \
    useradd -r -u 1001 -g appuser -d /home/appuser -m appuser

# Copy installed Python packages from builder
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local

# Copy application files resolved from context-resolver
COPY --from=context-resolver --chown=appuser:appuser /src /app

# Ensure staticfiles, media, and entrypoint have correct permissions
RUN mkdir -p /app/staticfiles /app/media && \
    chown -R appuser:appuser /app && \
    chmod +x /app/entrypoint.sh

# Switch to non-root user
USER appuser

# Pre-compile and compress static assets using WhiteNoise during build
RUN python manage.py collectstatic --noinput

# Expose HTTP port (Dokploy routes internal traffic here)
EXPOSE 8000

# Health check using the existing /healthz/ endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/healthz/ || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
