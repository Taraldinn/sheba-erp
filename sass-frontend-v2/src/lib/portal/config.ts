/**
 * Portal configuration with environment variable defaults.
 * Allows deployment across any domain structure (e.g. example.com, shebafi.xyz, etc.)
 */

export const RESERVED_SLUGS = new Set([
    'www',
    'api',
    'admin',
    'app',
    'saas',
    'control',
    'mail',
    'static',
    'assets',
    'cdn',
    'portal',
    'auth',
    'health',
    'healthz',
    'system',
    'dev',
    'test',
    'stage',
    'staging',
    'docs',
    'swagger',
    'redoc',
    'openapi',
]);

function getEnv(key: string, fallback: string): string {
    // import.meta.env is the standard Vite surface; fall back to the fallback
    // when running under SSR or a non-Vite test harness.
    try {
        const v = (import.meta as unknown as { env?: Record<string, string> }).env?.[key];
        if (typeof v === 'string' && v.length > 0) return v.trim().toLowerCase();
    } catch {
        /* not in Vite */
    }
    return fallback;
}

export const PORTAL_CONFIG = {
    superAdminHost: getEnv('VITE_SUPER_ADMIN_HOST', 'admin.example.com'),
    ispAdminHost: getEnv('VITE_ISP_HOST', 'app.example.com'),
    publicHomeHost: getEnv('VITE_PUBLIC_HOME_HOST', 'example.com'),
    tenantRootDomain: getEnv('VITE_TENANT_ROOT_DOMAIN', 'example.com'),
    knownApexDomains: [
        'example.com',
        'shebafi.xyz',
        'shebafi.com',
        'localhost',
    ],
    devHosts: ['localhost', '127.0.0.1'],
};