/**
 * LB / platform probe endpoint for the `sass-admin` Next.js app.
 *
 * Ref: sass-admin/task.md T-84.
 *
 * Returns 200 OK with a tiny JSON body whenever the Next.js server can
 * serve a request. This is *not* a deep health check — it intentionally
 * does NOT probe Django here, because:
 *   - The platform's LB only needs to know "can this Node process reply
 *     to HTTP". A deep check would add a request to Django on every
 *     probe tick (every few seconds).
 *   - Django's own readiness probe lives at
 *     `https://api.shebafi.xyz/healthz/` and is wired separately.
 *
 * If we ever want a *deep* admin-UI health check (verifies the SaaS
 * admin session can hit `/auth/me/`), put it at `/api/admin/deep-health`
 * and call it from the cron monitor, not from the LB probe.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      app: "sass-admin",
      version: process.env.npm_package_version ?? "0.0.0",
      time: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        // Prevent any intermediary from caching the probe response.
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
