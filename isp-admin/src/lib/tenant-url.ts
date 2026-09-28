/**
 * src/lib/tenant-url.ts — tenant-aware API base URL resolution.
 *
 * Background
 * ----------
 * Each ISP tenant runs on its own subdomain of `*.shebafi.xyz`
 * (e.g. `exportnet.shebafi.xyz`). The backend Django app is the SAME
 * codebase — the ``apps.core.middleware.TenantSubdomainMiddleware``
 * looks at ``Host:`` and resolves the right ``Tenant`` row from
 * the ``TenantDomain`` table or the slug fallback. The same
 * ``/api/v1/...`` URLconf is therefore served on every tenant
 * subdomain, just scoped to that tenant's data.
 *
 * The frontend used to hit a single ``NEXT_PUBLIC_API_URL`` (one
 * deployment-wide backend) and selected the tenant via the
 * ``X-Tenant`` header / login form. That worked when the customer
 * support team bounced between tenants on a shared portal, but
 * ISP owners complained that:
 *
 *   1. They couldn't bookmark ``exportnet.shebafi.xyz/login`` and
 *      expect it to land in their own ERP — the API_URL pointed
 *      at the central admin backend.
 *   2. Cookies / IP-based tenancy limits were visible to network
 *      operators (less critical, but unsettling).
 *   3. There was no way to do a private subdomain rotation
 *      (DNS split for compliance).
 *
 * This module turns the hostname into the API root:
 *
 *   exportnet.shebafi.xyz     → https://exportnet.shebafi.xyz/api/v1
 *   admin.shebafi.xyz         → https://admin.shebafi.xyz/api/v1 (SaaS)
 *   localhost:3000 (dev)      → NEXT_PUBLIC_API_URL || http://localhost:8000/api/v1
 *
 * It also exposes ``extractTenantSlug()`` so the login form can
 * pre-fill the tenant field and hide it on the dedicated subdomain.
 *
 * The resolver is intentionally **isomorphic**: it works in the
 * browser (with ``window``), in SSR (``window`` undefined), and
 * under ``node:test`` (we accept an optional ``hostname`` parameter
 * to keep tests deterministic).
 */

const DEFAULT_API_PATH = '/api/v1';
const TENANT_PARENT_DOMAINS = new Set([
  'shebafi.xyz',
  'shebafi.com',
  'shebafi.io',
  'shebafi.dev',
  'localhost',
  'test',
]);

const CENTRAL_ADMIN_HOSTS = new Set([
  'admin.shebafi.xyz',
  'admin.shebafi.com',
  'central.shebafi.xyz',
]);

const PORTAL_HOSTS = new Set([
  'portal.shebafi.xyz',
  'customer.shebafi.xyz',
]);

export interface TenantHostContext {
  hostname: string;
  /** First label of the hostname (e.g. ``"exportnet"`` for
   *  ``"exportnet.shebafi.xyz"``). ``null`` for apex / IP / localhost. */
  subdomain: string | null;
  parent: string;
  /** True for the central-admin SaaS dashboard (``admin.shebafi.xyz``). */
  isCentralAdmin: boolean;
  /** True for the customer self-care portal (``portal.shebafi.xyz``). */
  isPortal: boolean;
  /** True when the host is one of our recognised tenant subdomains. */
  isTenantHost: boolean;
  /**
   * True for development hosts (``localhost``, ``127.0.0.1``, raw
   * IPv4/IPv6 addresses, and reserved ``*.local`` / ``*.test``
   * names). These are never real tenant subdomains in production;
   * they're how an operator reaches the dev backend from a single
   * machine, even when their ``/etc/hosts`` happens to alias the
   * hostname.
   *
   * Used by the resolver to short-circuit tenant-subdomain routing
   * and by the login page to render a "dev mode" hint.
   */
  isDevHost: boolean;
  /**
   * True for IP-literal hosts (``192.168.x.x`` style). Sometimes
   * the operator hits the dev backend from a network IP rather than
   * via localhost — we still want to treat that as dev mode.
   */
  isLoopback: boolean;
}

function detectDevHost(noPort: string): { isDevHost: boolean; isLoopback: boolean } {
  if (!noPort) return { isDevHost: true, isLoopback: true };
  if (noPort === 'localhost') {
    return { isDevHost: true, isLoopback: true };
  }
  // IPv4 literal
  if (/^(\d+\.){3}\d+$/.test(noPort)) {
    const octets = noPort.split('.').map(Number);
    // RFC1918 private ranges + the loopback range (127.0.0.0/8) +
    // link-local (169.254.0.0/16) + CGNAT (100.64.0.0/10).
    const isLoopback = octets[0] === 127;
    const isPrivate =
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
    return { isDevHost: true, isLoopback };
  }
  // IPv6 literal — ``[::1]`` style or ``::1``
  if (noPort === '::1' || noPort === '0:0:0:0:0:0:0:1') {
    return { isDevHost: true, isLoopback: true };
  }
  // mDNS / test TLDs the operator uses locally
  if (
    noPort === 'local' ||
    noPort === 'test' ||
    noPort.endsWith('.local') ||
    noPort.endsWith('.test') ||
    noPort.endsWith('.localhost')
  ) {
    return { isDevHost: true, isLoopback: false };
  }
  return { isDevHost: false, isLoopback: false };
}

/** Pure string parser — useful in tests. */
export function parseTenantHost(rawHostname: string): TenantHostContext {
  const hostname = (rawHostname || '').toLowerCase().trim();
  const noPort = hostname.split(':')[0] || 'localhost';
  const dev = detectDevHost(noPort);
  const isLiteralIp = /^(\d+\.){3}\d+$/.test(noPort);

  // Determine the parent domain. ``localhost`` and bare IPs have
  // no parent — treat as dev/standalone.
  let parent = '';
  let subdomain: string | null = null;
  if (isLiteralIp || noPort === 'localhost') {
    parent = noPort;
    subdomain = null;
  } else {
    const parts = noPort.split('.').filter(Boolean);
    if (parts.length >= 2) {
      parent = parts.slice(-2).join('.');
      subdomain = parts.length > 2 ? parts.slice(0, -2).join('.') : null;
    } else {
      parent = noPort;
      subdomain = null;
    }
  }

  const isCentralAdmin = CENTRAL_ADMIN_HOSTS.has(noPort);
  const isPortal = PORTAL_HOSTS.has(noPort);
  const isTenantHost =
    !isCentralAdmin &&
    !isPortal &&
    !dev.isDevHost &&
    subdomain !== null &&
    !TENANT_PARENT_DOMAINS.has(parent) === false &&
    subdomain.length > 0;

  return {
    hostname: noPort,
    subdomain,
    parent,
    isCentralAdmin,
    isPortal,
    isTenantHost,
    isDevHost: dev.isDevHost,
    isLoopback: dev.isLoopback,
  };
}

/**
 * Resolve the API base URL for the current page.
 *
 * Resolution order:
 *   1. ``NEXT_PUBLIC_API_URL`` (explicit env override — used for
 *      dev, staging, and the legacy single-tenant deployment).
 *      This is consulted REGARDLESS of the current hostname so a
 *      dev operator who has aliased ``exportnet.shebafi.xyz`` to
 *      ``127.0.0.1`` in ``/etc/hosts`` still hits the local
 *      backend instead of trying to reach a production HTTPS host.
 *   2. If running on a recognised tenant subdomain (and NOT a dev
 *      host — see step 1 caveat), return
 *      ``https://<hostname>/api/v1`` so the Django backend serves
 *      the same URLconf on every tenant subdomain and scopes data
 *      via the Host header.
 *   3. If running on the central admin host, return
 *      ``https://admin.shebafi.xyz/api/v1`` so SaaS / super-admin
 *      requests hit the central app.
 *   4. Fallback: ``http://localhost:8000/api/v1`` (the Django dev
 *      server).
 *
 * Pass ``hostname`` explicitly in tests; otherwise the function
 * reads ``window.location.hostname`` at call time.
 */
export function resolveApiBaseUrl(
  envUrl: string | undefined,
  hostname?: string
): string {
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.replace(/\/+$/, '');
  }

  const h =
    hostname ??
    (typeof window !== 'undefined' ? window.location?.hostname : '') ??
    '';

  if (!h) {
    return `http://localhost:8000${DEFAULT_API_PATH}`;
  }

  // Dev hosts must NEVER derive the URL from the hostname —
  // otherwise an operator with ``/etc/hosts`` aliasing
  // ``exportnet.shebafi.xyz → 127.0.0.1`` would try to POST over
  // HTTPS to a host Django isn't bound to, get a connection error,
  // and conclude "login is broken".
  const dev = detectDevHost(h.split(':')[0] || '');
  if (dev.isDevHost) {
    return `http://localhost:8000${DEFAULT_API_PATH}`;
  }

  const proto =
    typeof window !== 'undefined' && window.location?.protocol
      ? window.location.protocol
      : 'https:';

  const cleanHost = h.split(':')[0];
  return `${proto}//${cleanHost}${DEFAULT_API_PATH}`;
}

/**
 * Extract the tenant slug from the current hostname. Returns ``null``
 * for apex domains, central admin, portal, localhost, and IPs.
 *
 * Used by the login page to:
 *   - pre-fill the "ISP Tenant / Operator ID" field,
 *   - hide that field entirely when the operator is already on the
 *     dedicated tenant subdomain (it's redundant — the backend
 *     already knows who they are).
 *
 * Dev hosts ALWAYS return ``null`` even when the operator has
 * aliased ``exportnet.shebafi.xyz`` in ``/etc/hosts`` — see the
 * ``detectDevHost`` note above.
 */
export function extractTenantSlug(
  hostname?: string
): string | null {
  const h = hostname ?? (
    typeof window !== 'undefined' ? window.location?.hostname : ''
  );
  if (!h) return null;
  const ctx = parseTenantHost(h);
  if (ctx.isDevHost) return null;
  return ctx.isTenantHost ? ctx.subdomain : null;
}
