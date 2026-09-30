"use client";

/**
 * Top-level error boundary — catches any uncaught render / data-fetch
 * exception in any route under (admin) and renders a recoverable UI
 * instead of blanking the whole shell.
 *
 * Ref: sass-admin/task.md T-50.
 *
 * Notes:
 *  - In Next.js 16 the segment-level `error.tsx` MUST be a Client Component.
 *  - We deliberately do NOT render the AdminShell here — we don't know
 *    whether the failure was auth-related; a clean fallback lets the
 *    user click "Sign in again" without a partially-mounted sidebar.
 *  - `digest` is a Next.js-generated stable id we surface in the UI and
 *    ship to `/api/v1/saas/audit-logs/` via lib/report-error (T-53) so the
 *    backend's audit log has a matching entry for the 500.
 */

import { useEffect } from "react";
import { Button, Card } from "@heroui/react";

import { siteConfig } from "@/config/site";
import { reportClientError } from "@/lib/report-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Best-effort: don't await; we don't want a failed report to block
    // the recovery flow. The helper swallows errors itself.
    void reportClientError({
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      source: "app/error.tsx",
      url: typeof window !== "undefined" ? window.location.href : "",
    });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Card className="w-full max-w-md border border-separator bg-surface">
        <Card.Header className="border-b border-separator">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
        </Card.Header>
        <Card.Content className="space-y-3 p-6 text-sm text-muted">
          <p>
            {siteConfig.name} hit an unexpected error rendering this page. The
            support team has been notified automatically.
          </p>
          {error.digest ? (
            <div className="rounded-md bg-surface-secondary px-3 py-2 text-xs font-mono text-foreground break-all">
              <span className="font-semibold">Reference id:</span>{" "}
              {error.digest}
            </div>
          ) : null}
          <pre className="max-h-40 overflow-auto rounded-md bg-surface-secondary p-3 text-xs text-foreground">
            {error.message}
          </pre>
          <div className="flex gap-2 justify-end">
            <Button
              variant="tertiary"
              onPress={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/login";
                }
              }}
            >
              Sign in again
            </Button>
            <Button variant="primary" onPress={() => reset()}>
              Try again
            </Button>
          </div>
        </Card.Content>
      </Card>
    </main>
  );
}
