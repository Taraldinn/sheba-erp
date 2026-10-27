/**
 * Only allow same-origin relative paths (e.g. "/dashboard?x=1").
 * Rejects absolute URLs, protocol-relative ("//evil.com") and backslash tricks
 * so `?next=` / `?callbackUrl=` can't be used as an open redirect.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/dashboard'): string {
    if (!value) return fallback;
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    return value;
}
