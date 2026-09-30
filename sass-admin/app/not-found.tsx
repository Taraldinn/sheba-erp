"use client";

/**
 * Catch-all 404 page rendered by Next.js for any route that doesn't
 * match. Kept intentionally minimal — the AdminShell is not mounted
 * here so a missing route doesn't briefly render the sidebar then
 * disappear.
 *
 * Ref: sass-admin/task.md T-51.
 *
 * NB: This file MUST be a Client Component. Next.js renders `not-found.tsx`
 * as a Server Component by default, but @heroui/react transitively imports
 * `client-only`, which is rejected in RSC. The `"use client"` pragma at
 * the top moves the module into the client bundle and resolves the build
 * error: 'client-only cannot be imported from a Server Component module'.
 */

import Link from "next/link";
import { Button, Card } from "@heroui/react";

import { siteConfig } from "@/config/site";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Card className="w-full max-w-md border border-separator bg-surface">
        <Card.Header className="flex flex-col items-start gap-1 border-b border-separator">
          <span className="text-xs font-mono uppercase tracking-wider text-default-500">
            404 — Not Found
          </span>
          <h1 className="text-lg font-semibold">This page does not exist</h1>
        </Card.Header>
        <Card.Content className="space-y-4 p-6 text-sm text-muted">
          <p>
            The page you tried to reach is not part of {siteConfig.name}. It may
            have been moved or never existed.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="tertiary">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button variant="primary">
              <Link href="/overview">Go to overview</Link>
            </Button>
          </div>
        </Card.Content>
      </Card>
    </main>
  );
}
