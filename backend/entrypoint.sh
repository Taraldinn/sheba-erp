#!/bin/sh
set -e

echo "=== Sheba ERP Backend Starting ==="

# Run database migrations if enabled (default: true)
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "Applying database migrations..."
    python manage.py migrate --noinput
else
    echo "Skipping migrations (RUN_MIGRATIONS=${RUN_MIGRATIONS})"
fi

# Execute custom command if passed (e.g. createsuperuser, shell, test)
if [ $# -gt 0 ]; then
    echo "Executing custom command: $@"
    exec "$@"
fi

# Default: Start production Gunicorn server
PORT="${PORT:-8000}"
WORKERS="${WEB_CONCURRENCY:-3}"
TIMEOUT="${GUNICORN_TIMEOUT:-120}"

echo "Starting Gunicorn on port ${PORT} with ${WORKERS} workers (timeout: ${TIMEOUT}s)..."
exec gunicorn sheba_core.wsgi:application \
    --bind "0.0.0.0:${PORT}" \
    --workers "${WORKERS}" \
    --timeout "${TIMEOUT}" \
    --access-logfile - \
    --error-logfile -
