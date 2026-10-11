# Sheba ERP — Production Deployment Guide
## Backend on Dokploy (VPS Docker) + Frontend on Vercel (Next.js)

This repository is optimized for a decoupled cloud architecture:
- **Backend API & Background Workers**: Deployed on a Linux VPS using **Dokploy** (Docker / Docker Compose).
- **Frontend Portals & Marketing**: Deployed globally on **Vercel** (Next.js 16 with multi-tenant subdomain routing).

> **Want to host the frontend on Cloudflare Workers instead?** See
> `sass-frontend-v2/CLOUDFLARE_DEPLOY.md`. The OpenNext adapter
> (`@opennextjs/cloudflare`) replaces Vercel with no other code changes; the
> Django backend + Dokploy deployment stays identical.

---

## Part 1: Backend Deployment on Dokploy (VPS)

### 1. Prerequisites on your VPS
Dokploy runs on any modern Linux VPS (Ubuntu 22.04 / 24.04 or Debian 12 recommended, minimum 2GB RAM / 2 vCPUs).
If Dokploy is not yet installed on your VPS, install it with:
```bash
curl -sSL https://dokploy.com/setup.sh | sh
```
Access the Dokploy dashboard at `http://<your-vps-ip>:3000` and create your administrative account.

---

### 2. Deployment Method (Dokploy Compose Stack)
Using **Docker Compose** on Dokploy is the recommended approach because it deploys Django, the Celery async worker, Celery beat scheduler, PostgreSQL, and Redis as a cohesive stack.

1. In Dokploy, go to **Projects** &rarr; Select or create a project (e.g. `Sheba-ERP`).
2. Click **Create Service** &rarr; Select **Compose**.
3. Name the service: `sheba-backend-stack`.
4. Under **Source**:
   - Connect your Git repository: `https://github.com/Taraldinn/sheba-erp` (branch: `main`).
   - Compose File Path: `docker-compose.dokploy.yml`
5. Under **Environment Variables**, paste your production values based on [`backend/.env.production.example`](file:///home/taraldinn/Documents/Sheba%20codebase/backend/.env.production.example):

```bash
# ── Core Runtime ──
ENVIRONMENT=production
DEBUG=False
PORT=8000
WEB_CONCURRENCY=3
RUN_MIGRATIONS=true
LOG_LEVEL=INFO

# ── Keys (CRITICAL: Generate strong random secrets!) ──
# Generate with: python3 -c 'import secrets; print(secrets.token_urlsafe(50))'
SECRET_KEY=replace-with-a-random-50-character-secret-key

# Generate 32-char key with: python3 -c 'import secrets; print(secrets.token_urlsafe(32)[:32])'
FIELD_ENCRYPTION_KEY=replace-with-32-char-random-key!

# ── Domains & Networking ──
ALLOWED_HOSTS=api.yourdomain.com,<your-vps-ip>,localhost,127.0.0.1
SUPER_ADMIN_DOMAIN=admin.yourdomain.com

# ── CORS & CSRF (Allow Vercel frontend) ──
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com,https://app.yourdomain.com,https://*.vercel.app
CORS_ALLOW_ALL_ORIGINS=False
CSRF_TRUSTED_ORIGINS=https://api.yourdomain.com,https://yourdomain.com,https://admin.yourdomain.com,https://app.yourdomain.com

# ── Internal Databases (from docker-compose.dokploy.yml) ──
POSTGRES_DB=sheba_erp
POSTGRES_USER=sheba_user
POSTGRES_PASSWORD=replace-with-a-secure-database-password
DATABASE_URL=postgres://sheba_user:replace-with-a-secure-database-password@postgres:5432/sheba_erp
REDIS_URL=redis://redis:6379/0
```

6. Click **Deploy**.
   Dokploy will build the Docker image, run all database migrations automatically via `entrypoint.sh`, start PostgreSQL and Redis, and launch the API and Celery workers.

---

### 3. Expose API Domain & SSL in Dokploy
1. In the Compose service settings, go to the **Domains** tab.
2. Add a new domain:
   - **Host**: `api.yourdomain.com`
   - **Path**: `/`
   - **Container Service**: `backend`
   - **Port**: `8000`
   - **HTTPS / SSL**: Toggle **ON** (Let's Encrypt will automatically issue an SSL certificate).
3. In your DNS provider (Cloudflare, Namecheap, etc.), add an **A record**:
   ```text
   Type: A
   Name: api
   IPv4: <your-vps-ip>
   ```

---

### 4. Create Initial Platform Admins (Dokploy Terminal)
Once the backend container is running:
1. In Dokploy, go to the `sheba-backend` container &rarr; click **Terminal / Exec**.
2. Run the command to create an ISP Admin:
   ```bash
   python manage.py createispadmin --username ispadmin --password admin123 --tenant baler_isp
   ```
3. Run the command to create a Django Superuser (for central platform control):
   ```bash
   python manage.py createsuperuser
   ```

---

## Part 2: Frontend Deployment on Vercel

The frontend is a modern **Next.js 16 (App Router)** multi-tenant application located in [`sass-frontend-v2/`](file:///home/taraldinn/Documents/Sheba%20codebase/sass-frontend-v2).

### 1. Import Repository into Vercel
1. Log in to [Vercel](https://vercel.com/) &rarr; click **Add New** &rarr; **Project**.
2. Select your repository: `Taraldinn/sheba-erp`.
3. Configure **Project Settings**:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click *Edit* and select `sass-frontend-v2`.

---

### 2. Configure Environment Variables in Vercel
In the Vercel project configuration, add the following Environment Variables (for *Production* and *Preview*):

| Variable | Value / Description | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Full backend API URL (with `/api/v1`) | `https://api.yourdomain.com/api/v1` |
| `NEXT_PUBLIC_API_BASE_URL` | Full backend API URL | `https://api.yourdomain.com/api/v1` |
| `NEXT_PUBLIC_SUPER_ADMIN_HOST` | SaaS Platform Owner Admin Host | `admin.yourdomain.com` |
| `NEXT_PUBLIC_ISP_HOST` | ISP Owner Portal Host | `app.yourdomain.com` |
| `NEXT_PUBLIC_PUBLIC_HOME_HOST` | Marketing Landing Host | `yourdomain.com` |
| `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` | Multi-Tenant Root Domain | `yourdomain.com` |
| `NEXT_PUBLIC_KNOWN_APEX_DOMAINS` | Known Apex Domain | `yourdomain.com` |
| `NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED` | Public signup feature flag | `true` |
| `NEXT_PUBLIC_SHOW_DEV_PORTAL_SWITCHER` | Dev switcher widget (keep `false` in prod) | `false` |

---

### 3. Deploy & Setup Domains in Vercel
1. Click **Deploy**. Vercel will install dependencies via `pnpm` and run `next build`.
2. Once deployed, navigate to **Project Settings** &rarr; **Domains** in Vercel:
   - Add `yourdomain.com` (Marketing landing page &rarr; `/`)
   - Add `www.yourdomain.com` (Redirects to `yourdomain.com`)
   - Add `admin.yourdomain.com` (SaaS owner control plane &rarr; `/saas`)
   - Add `app.yourdomain.com` (ISP owner management portal &rarr; `/isp`)
   - Add `*.yourdomain.com` (Wildcard domain: routes any tenant `<slug>.yourdomain.com` &rarr; `/tenant`)

3. In your DNS provider (e.g. Cloudflare):
   - Add **CNAME** records for `admin`, `app`, and `*` pointing to `cname.vercel-dns.com`.
   - Add **A / CNAME** for apex `yourdomain.com` pointing to `76.76.21.21` (or Vercel CNAME).

---

## Part 3: Architecture & Multi-Tenant Routing Summary

```mermaid
graph TD
    Client["Browser / Client"]

    subgraph Vercel ["Vercel Edge Network (Next.js Frontend)"]
        Apex["yourdomain.com -> / (Marketing Landing)"]
        AdminHost["admin.yourdomain.com -> /saas (SaaS Control Plane)"]
        AppHost["app.yourdomain.com -> /isp (ISP Owner Dashboard)"]
        TenantHost["*.yourdomain.com -> /tenant (Tenant Self-Care & Operations)"]
    end

    subgraph Dokploy ["Dokploy Linux VPS (Docker Engine)"]
        Traefik["Traefik Reverse Proxy (api.yourdomain.com:443 SSL)"]
        Backend["Gunicorn API Server (:8000)"]
        CeleryWorker["Celery Worker (billing, network, default)"]
        CeleryBeat["Celery Beat (periodic scheduler)"]
        Postgres[("PostgreSQL 16")]
        Redis[("Redis 7 Cache / Broker")]
    end

    Client -->|Web Requests| Vercel
    Vercel -->|REST API with CORS / Cookies| Traefik
    Traefik --> Backend
    Backend --> Postgres
    Backend --> Redis
    CeleryWorker --> Postgres
    CeleryWorker --> Redis
    CeleryBeat --> Redis
```

---

## Part 4: Verification Probes

Once both backend and frontend are live:

1. **Backend Health Probe**:
   ```bash
   curl -s -i https://api.yourdomain.com/healthz/
   # Expect: HTTP/2 200 OK -> {"status": "ok", ...}
   ```
2. **OpenAPI / Swagger Documentation**:
   Visit: `https://api.yourdomain.com/api/schema/swagger-ui/`
3. **SaaS Owner Portal**:
   Visit: `https://admin.yourdomain.com/` (auto-redirects to `/saas/login`)
4. **ISP Owner Portal**:
   Visit: `https://app.yourdomain.com/` (auto-redirects to `/isp/login`)
5. **Tenant Portal**:
   Visit: `https://<tenant_slug>.yourdomain.com/` (auto-redirects to `/tenant/login`)
