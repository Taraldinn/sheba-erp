# Deploying Shebafi Frontend to Vercel

This Next.js 16 frontend application is 100% pre-configured and optimized for zero-config deployment on [Vercel](https://vercel.com).

---

## 🚀 Option 1: Deploy with Vercel CLI (Fastest)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy directly from the project directory**:
   ```bash
   cd "sass-frontend-v2"
   vercel
   ```
   * Link to your Vercel account / team.
   * Accept defaults (Framework: **Next.js**, Build command: `next build`, Output directory: `.next`).

3. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

---

## 🌐 Option 2: Deploy via Vercel Web Dashboard (GitHub / GitLab / Bitbucket)

1. Push your changes to your Git repository:
   ```bash
   git push origin main
   ```
2. Log in to [vercel.com](https://vercel.com) and click **"Add New..." > "Project"**.
3. Import your Git repository (`Taraldinn/sheba-erp`).
4. In **Project Configuration**:
   * **Root Directory**: `sass-frontend-v2` (click "Edit" and choose the `sass-frontend-v2` folder).
   * **Framework Preset**: **Next.js** (detected automatically).
   * **Build Command**: `pnpm run build` (or `next build`).
   * **Install Command**: `pnpm install`.
5. Expand **Environment Variables** and enter the production settings below.
6. Click **Deploy**.

---

## 🔑 Required Environment Variables

Configure these in the Vercel Dashboard under **Project Settings > Environment Variables**:

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api/v1` | **(Required)** Central backend API endpoint for all auth, billing, and router operations. |
| `NEXT_PUBLIC_SAAS_API_BASE_URL` | `https://api.yourdomain.com/api/v1/saas` | *(Optional)* Direct SaaS central control plane API. |
| `NEXT_PUBLIC_SUPER_ADMIN_HOST` | `admin.yourdomain.com` | Hostname mapped to the Super Admin portal (`/saas`). |
| `NEXT_PUBLIC_ISP_HOST` | `app.yourdomain.com` | Hostname mapped to the ISP Operator portal (`/isp`). |
| `NEXT_PUBLIC_PUBLIC_HOME_HOST` | `yourdomain.com` | Apex domain for public marketing landing page (`/`). |
| `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` | `yourdomain.com` | Root domain for multi-tenant subdomains (`[slug].yourdomain.com` -> `/tenant`). |
| `NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED` | `true` or `false` | Enable or disable public self-service signup. |

---

## 🌍 Custom Domains & Subdomain Routing

If using multi-tenant subdomains:
1. Go to **Settings > Domains** in your Vercel Project.
2. Add your Apex domain: `yourdomain.com`.
3. Add wildcard domain for tenants: `*.yourdomain.com` (requires CNAME or DNS A records pointing to `76.76.21.21` or `cname.vercel-dns.com`).
4. Add operator domain: `app.yourdomain.com`.
5. Add admin domain: `admin.yourdomain.com`.

The built-in middleware dynamically routes incoming requests to the appropriate portal according to the hostname.
