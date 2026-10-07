#!/usr/bin/env bash

# ==============================================================================
# Sheba ERP & SaaS Full-Stack Development Runner
# Launches Backend (Django: 8000), the SaaS Vite app (sass-frontend/: 5174),
# and (optionally) the legacy ISP frontend + super-admin bundles if those
# directories exist.
# ==============================================================================

# ANSI Color Codes
BOLD='\033[1m'
CYAN='\033[36m'
BLUE='\033[34m'
MAGENTA='\033[35m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/isp-admin"
SUPERADMIN_DIR="$ROOT_DIR/sass-admin"
SASS_FRONTEND_DIR="$ROOT_DIR/sass-frontend"
VENV_PYTHON="$BACKEND_DIR/venv/bin/python"

# CLI flags:
#   --no-frontend   skip the legacy ISP frontend (isp-admin/, port 3000)
#   --no-sa         skip the legacy super-admin (sass-admin/, port 3001)
#   --no-sass       skip the new sass-frontend Vite app (port ${SASS_FRONTEND_PORT:-5174})
#   --port <p>      override the sass-frontend dev server port (default 5174)
LEGACY_FRONTEND_ENABLED=1
LEGACY_SA_ENABLED=1
SASS_FRONTEND_ENABLED=1
SASS_FRONTEND_PORT="${SASS_FRONTEND_PORT:-5174}"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-frontend) LEGACY_FRONTEND_ENABLED=0 ;;
    --no-sa)       LEGACY_SA_ENABLED=0 ;;
    --no-sass)     SASS_FRONTEND_ENABLED=0 ;;
    --port)
      shift
      SASS_FRONTEND_PORT="${1:-5174}"
      ;;
    -h|--help)
      cat <<USAGE
Usage: $0 [--no-frontend] [--no-sa] [--no-sass] [--port <p>]

  --no-frontend   Skip isp-admin/   (legacy ISP frontend,    port 3000)
  --no-sa         Skip sass-admin/  (legacy super-admin,     port 3001)
  --no-sass       Skip sass-frontend/  (Vite SaaS app,       port ${SASS_FRONTEND_PORT})
  --port <p>      Override the sass-frontend port (default 5174)
USAGE
      exit 0
      ;;
    *)
      echo -e "${YELLOW}[WARN] Unknown flag: $1${RESET}" ;;
  esac
  shift
done

# Verify virtual environment
if [ ! -f "$VENV_PYTHON" ]; then
  if command -v python3 &>/dev/null; then
    VENV_PYTHON="python3"
    echo -e "${YELLOW}[WARN] backend/venv not found. Using system python3.${RESET}"
  else
    echo -e "${RED}[ERROR] Python not found. Please create backend/venv first.${RESET}"
    exit 1
  fi
fi

# Ensure npm / node are in PATH (fallback for nvm environments)
if ! command -v npm &>/dev/null && [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(ls -d "$HOME/.nvm/versions/node"/*/bin 2>/dev/null | tail -n 1)"
  if [ -n "$NODE_BIN" ]; then
    export PATH="$NODE_BIN:$PATH"
  fi
fi

if ! command -v npm &>/dev/null; then
  echo -e "${RED}[ERROR] npm not found. Please install Node.js/npm or ensure it is in your PATH.${RESET}"
  exit 1
fi

# Ensure local environment
export ENVIRONMENT="${ENVIRONMENT:-local}"

# Track child PIDs
BACKEND_PID=""
FRONTEND_PID=""
SUPERADMIN_PID=""
SASS_FRONTEND_PID=""

cleanup() {
  echo -e "\n${YELLOW}[SHUTDOWN] Terminating all development services...${RESET}"

  if [ -n "$BACKEND_PID" ]; then
    kill -TERM "$BACKEND_PID" 2>/dev/null
  fi
  if [ -n "$FRONTEND_PID" ]; then
    kill -TERM "$FRONTEND_PID" 2>/dev/null
  fi
  if [ -n "$SUPERADMIN_PID" ]; then
    kill -TERM "$SUPERADMIN_PID" 2>/dev/null
  fi
  if [ -n "$SASS_FRONTEND_PID" ]; then
    kill -TERM "$SASS_FRONTEND_PID" 2>/dev/null
  fi

  sleep 0.5

  # Ensure ports are free
  fuser -k 8000/tcp 3000/tcp 3001/tcp 5174/tcp 2>/dev/null || true

  echo -e "${GREEN}[SHUTDOWN] All services stopped cleanly.${RESET}"
  exit 0
}

# Trap signals for graceful exit
trap cleanup INT TERM

echo -e "${BOLD}${CYAN}================================================================${RESET}"
echo -e "${BOLD}${CYAN}           Sheba ERP & SaaS Full-Stack Dev Server               ${RESET}"
echo -e "${BOLD}${CYAN}================================================================${RESET}"
echo -e "  ${GREEN}●${RESET} ${BOLD}Backend API:${RESET}     http://127.0.0.1:8000 (Admin: /admin/)"
echo -e "  ${GREEN}●${RESET} ${BOLD}ISP Frontend:${RESET}    http://localhost:3000"
echo -e "  ${GREEN}●${RESET} ${BOLD}Super-Admin:${RESET}     http://localhost:3001"
echo -e "  ${GREEN}●${RESET} ${BOLD}SaaS Frontend:${RESET}   http://localhost:${SASS_FRONTEND_PORT} (admin.localhost / example.com via portal resolver)"
echo -e "${CYAN}----------------------------------------------------------------${RESET}"
echo -e "Press ${BOLD}Ctrl+C${RESET} to gracefully stop all services."
echo -e "${CYAN}----------------------------------------------------------------${RESET}\n"

# 1. Start Backend Django API (port 8000)
(
  cd "$BACKEND_DIR" && "$VENV_PYTHON" manage.py runserver 0.0.0.0:8000 2>&1 | while IFS= read -r line; do
    echo -e "${CYAN}[BACKEND]${RESET} $line"
  done
) &
BACKEND_PID=$!

# 2. Start ISP Frontend (port 3000)
if [ "$LEGACY_FRONTEND_ENABLED" -eq 1 ] && [ -f "$FRONTEND_DIR/package.json" ]; then
  (
    cd "$FRONTEND_DIR" && npx next dev --webpack -p 3000 2>&1 | while IFS= read -r line; do
      echo -e "${BLUE}[FRONTEND]${RESET} $line"
    done
  ) &
  FRONTEND_PID=$!
else
  echo -e "${YELLOW}[WARN] ISP Frontend ($FRONTEND_DIR/package.json) not found. Skipping.${RESET}"
fi

# 3. Start Super-Admin (Vite React - port 3001)
if [ "$LEGACY_SA_ENABLED" -eq 1 ] && [ -f "$SUPERADMIN_DIR/package.json" ]; then
  (
    cd "$SUPERADMIN_DIR" && npm run dev -- --port 3001 2>&1 | while IFS= read -r line; do
      echo -e "${MAGENTA}[SUPER-ADMIN]${RESET} $line"
    done
  ) &
  SUPERADMIN_PID=$!
else
  echo -e "${YELLOW}[WARN] Super-Admin ($SUPERADMIN_DIR/package.json) not found. Skipping.${RESET}"
fi

# 4. Start sass-frontend (Vite React — port ${SASS_FRONTEND_PORT})
# This is the modern SPA that serves admin.example.com / admin.localhost /
# example.com via the portal resolver. Its /api requests are proxied to the
# Django backend on port 8000 (see sass-frontend/vite.config.ts).
if [ "$SASS_FRONTEND_ENABLED" -eq 1 ]; then
  if [ -f "$SASS_FRONTEND_DIR/package.json" ]; then
    (
      cd "$SASS_FRONTEND_DIR" && npm run dev -- --port "$SASS_FRONTEND_PORT" --host 2>&1 | while IFS= read -r line; do
        echo -e "${MAGENTA}[SASS-FRONTEND]${RESET} $line"
      done
    ) &
    SASS_FRONTEND_PID=$!
  else
    echo -e "${YELLOW}[WARN] sass-frontend ($SASS_FRONTEND_DIR/package.json) not found. Skipping.${RESET}"
  fi
else
  echo -e "${YELLOW}[SKIP] sass-frontend disabled via --no-sass.${RESET}"
fi

# Wait for children to run
wait
