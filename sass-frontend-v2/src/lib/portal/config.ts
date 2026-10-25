/**
 * Portal configuration with environment variable defaults.
 * Allows deployment across any domain structure (e.g. example.com, shebafi.xyz, etc.)
 */

export const RESERVED_SLUGS = new Set([
    'v2',
    'beta',
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

function getEnv(nextVal?: string, viteKey?: string, fallback: string = ''): string {
    if (nextVal && nextVal.trim()) return nextVal.trim().toLowerCase();
    if (typeof process !== 'undefined' && process.env && viteKey && process.env[viteKey]) {
        return process.env[viteKey]!.trim().toLowerCase();
    }
    try {
        if (viteKey) {
            const v = (import.meta as unknown as { env?: Record<string, string> }).env?.[viteKey];
            if (typeof v === 'string' && v.trim()) return v.trim().toLowerCase();
        }
    } catch {
        /* not in Vite */
    }
    return fallback;
}

const extraApexRaw = process.env.NEXT_PUBLIC_KNOWN_APEX_DOMAINS || '';
const extraApexList = extraApexRaw
    ? extraApexRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

export const PORTAL_CONFIG = {
    superAdminHost: getEnv(process.env.NEXT_PUBLIC_SUPER_ADMIN_HOST, 'VITE_SUPER_ADMIN_HOST', 'admin.example.com'),
    ispAdminHost: getEnv(process.env.NEXT_PUBLIC_ISP_HOST, 'VITE_ISP_HOST', 'app.example.com'),
    publicHomeHost: getEnv(process.env.NEXT_PUBLIC_PUBLIC_HOME_HOST, 'VITE_PUBLIC_HOME_HOST', 'example.com'),
    tenantRootDomain: getEnv(process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN, 'VITE_TENANT_ROOT_DOMAIN', 'example.com'),
    knownApexDomains: Array.from(new Set([
        'example.com',
        'shebafi.xyz',
        'shebafi.com',
        'localhost',
        ...extraApexList,
    ])),
    devHosts: ['localhost', '127.0.0.1'],
};