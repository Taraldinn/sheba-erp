"use client";

/**
 * AuthErrorPanel — surfaces the actual API response behind a failed
 * login attempt so the user (and the support team) can diagnose
 * without a console + devtools dance.
 *
 * The earlier banner only showed ``error.message`` + ``error.code``,
 * which was often a copy-pasted Django default ("Invalid username
 * or password") that masked the real cause — wrong host, wrong
 * tenant slug, CORS, network down, expired token, etc.
 *
 * This panel renders:
 *   - the human-friendly message at the top,
 *   - a compact diagnostic tile with the URL we tried, the HTTP
 *     status, and the raw response body,
 *   - a "copy diagnostic info" button that drops a single-line
 *     text blob on the clipboard for support tickets,
 *   - per-code "what to try" hints for the common cases (so the
 *     user can self-serve without filing a ticket).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Clipboard } from "lucide-react";

interface Props {
  error: {
    message: string;
    code?: string;
    status?: number;
    /** Echoed back from AuthService.login when available. */
    requestUrl?: string;
    rawBody?: string;
    availableTenants?: Array<{ id: string; name: string; slug?: string }>;
  } | null;
}

const CODE_HINTS: Record<string, string> = {
  INVALID_CREDENTIALS:
    "Username or password is wrong. Try resetting the password from the Forgot password link below.",
  CROSS_TENANT_LOGIN:
    "Your account is registered to a different ISP. Use the matching tenant subdomain (e.g. mula.shebafi.xyz for the Mula ISP account).",
  TENANT_NOT_FOUND:
    "The tenant you typed doesn't exist. Leave the tenant field empty if you're on the dedicated tenant subdomain, or pick from the dropdown.",
  TENANT_DOMAIN_REQUIRED:
    "This account can only log in via its dedicated tenant subdomain — not on admin.shebafi.xyz or localhost.",
  TENANT_INACTIVE:
    "Your ISP subscription is suspended. Contact your account manager.",
  MEMBERSHIP_INACTIVE:
    "Your staff membership was deactivated. Ask the ISP admin to re-enable it.",
  CONTROL_PLANE_ACCESS_DENIED:
    "ISP staff accounts can't log in to the central admin subdomain. Use the ISP tenant subdomain instead.",
  SESSION_EXPIRED:
    "Your session expired. Log in again to continue.",
  NETWORK_ERROR:
    "Couldn't reach the backend. Check your network, then verify NEXT_PUBLIC_API_URL points at a running Django server.",
  CORS_ERROR:
    "The backend is reachable but is rejecting this origin. Add the frontend origin to CORS_ALLOWED_ORIGINS on the Django side.",
};

export function AuthErrorPanel({ error }: Props) {
  const [expanded, setExpanded] = useState(false);

  const diagnostic = useMemo(() => {
    if (!error) return '';
    const payload: Record<string, unknown> = {
      when: new Date().toISOString(),
      host: typeof window !== 'undefined' ? window.location.host : '<ssr>',
      code: error.code || 'UNKNOWN',
      status: error.status || null,
      requestUrl: error.requestUrl || '',
      message: error.message,
      rawBody: error.rawBody || '',
    };
    return Object.entries(payload)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n');
  }, [error]);

  const hint =
    (error?.code && CODE_HINTS[error.code]) ||
    "Check the diagnostic tile below for the exact URL the frontend tried to reach.";

  if (!error) return null;

  return (
    <div
      data-testid="auth-error-panel"
      className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive"
    >
      <div className="p-3 flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-xs leading-snug" data-testid="auth-error-message">
            {error.message}
          </p>
          {error.code && (
            <span
              data-testid="auth-error-code"
              className="text-[10px] font-mono opacity-80 uppercase tracking-wide"
            >
              {error.code}
              {error.status ? ` · HTTP ${error.status}` : ''}
            </span>
          )}
          <p className="mt-1.5 text-[11px] text-destructive/80 leading-snug">{hint}</p>

          <button
            type="button"
            data-testid="auth-error-expand"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive/80 hover:text-destructive"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide diagnostic info' : 'Show diagnostic info'}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2">
              <pre
                data-testid="auth-error-diag"
                className="text-[10px] font-mono whitespace-pre-wrap break-all rounded border border-destructive/20 bg-destructive/5 p-2 max-h-32 overflow-auto"
              >
{`URL:     ${error.requestUrl || '(not captured)'}
STATUS:  ${error.status ?? '—'}
CODE:    ${error.code || 'UNKNOWN'}
MESSAGE: ${error.message}
BODY:    ${error.rawBody || '(empty)'}`}
              </pre>
              <button
                type="button"
                data-testid="auth-error-copy"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(diagnostic).catch(() => {});
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-background/60 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/15"
              >
                <Clipboard className="h-3 w-3" />
                Copy diagnostic info
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
