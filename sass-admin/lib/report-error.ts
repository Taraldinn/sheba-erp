/**
 * Client-side error reporter.
 *
 * Ref: sass-admin/task.md T-53.
 *
 * Forwards any uncaught error (render boundary, fetch failure, unhandled
 * promise rejection) to the backend's `/api/v1/saas/audit-logs/` endpoint
 * so the SaaS operator has a single timeline of what broke in the admin
 * UI, alongside backend audit entries.
 *
 * Design constraints:
 *  - The helper must NEVER throw. If the network or the API is down we
 *    silently drop the report — a failing report loop is worse than no
 *    report. The Sentry migration (T-81) will replace this with a proper
 *    crash reporter; until then, the audit-log endpoint is the closest
 *    thing to a structured sink we already have.
 *  - We only POST when we have a token (i.e. the user is logged in).
 *    Anonymous errors hit the 401 wall and produce audit spam, so we
 *    skip them.
 *  - Body is intentionally small: a 5 KB stack is plenty. Anything
 *    larger is truncated to avoid filling the audit log with garbage.
 */

import { ApiError, getApiBase, getStoredToken } from "./api";

export type ClientErrorReport = {
  message: string;
  digest?: string;
  stack?: string;
  source?: string;
  url?: string;
  extra?: Record<string, unknown>;
};

const MAX_STACK_CHARS = 5_000;

function trim(
  value: string | undefined,
  max = MAX_STACK_CHARS,
): string | undefined {
  if (!value) return undefined;

  return value.length > max ? `${value.slice(0, max)}\n[…truncated]` : value;
}

export async function reportClientError(
  report: ClientErrorReport,
): Promise<void> {
  try {
    const token = getStoredToken();

    if (!token) return; // anonymous errors are not auditable as a user action

    const base = getApiBase();
    const url = `${base}/audit-logs/`;

    const body = {
      action: "client_error",
      module: "saas_admin_ui",
      resource_type: "ClientError",
      resource_id: report.digest ?? null,
      details: {
        message: report.message,
        digest: report.digest ?? null,
        source: report.source ?? "unknown",
        url: report.url ?? null,
        stack: trim(report.stack),
        extra: report.extra ?? {},
        reported_at: new Date().toISOString(),
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Session ${token}`,
      },
      body: JSON.stringify(body),
      // `keepalive: true` lets the report survive a navigation away
      // (e.g. clicking "Sign in again" before the POST completes).
      keepalive: true,
    });

    if (!res.ok) {
      // Quietly drop — see design constraints above.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(
          `[report-error] audit-logs POST returned ${res.status} ${res.statusText}`,
        );
      }
    }
  } catch (err) {
    // Never let this helper itself crash the caller. If the Sentry path
    // is wired up later (T-81), it gets a second shot at the report.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[report-error] failed to forward client error:",
        err instanceof ApiError ? err.status : err,
      );
    }
  }
}

/**
 * Convenience wrapper around `fetch` that records the failure (if any)
 * to the audit log. Use this from any place we want a single-call fetch
 * that also captures its own errors.
 *
 * Returns the raw `Response` so the caller can still branch on status.
 */
export async function fetchWithErrorReport(
  input: RequestInfo | URL,
  init?: RequestInit,
  context: { source?: string } = {},
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    void reportClientError({
      message: err instanceof Error ? err.message : String(err),
      source: context.source ?? "fetch",
      url:
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : "",
    });
    throw err;
  }
}
