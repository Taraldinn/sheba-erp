/**
 * Portal configuration with environment variable defaults.
 * Allows deployment across any domain structure (e.g. example.xyz, shebafi.com, etc.)
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
]);

const getEnv = (key: string, fallback: string): string => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
            return (import.meta.env[key] as string).trim().toLowerCase();
        }
    } catch {
        // Fallback for non-Vite environments
    }
    return fallback;
};

export const PORTAL_CONFIG = {
    // Dedicated hostnames
    superAdminHost: getEnv('VITE_SUPER_ADMIN_HOST', 'admin.example.xyz'),
    ispAdminHost: getEnv('VITE_ISP_HOST', 'app.example.xyz'),
    publicHomeHost: getEnv('VITE_PUBLIC_HOME_HOST', 'example.com'),
    
    // Root domain for tenant subdomains (e.g., {slug}.example.com)
    tenantRootDomain: getEnv('VITE_TENANT_ROOT_DOMAIN', 'example.com'),

    // Additional known apex domains for public homepage
    knownApexDomains: [
        'example.com',
        'shebafi.xyz',
        'shebafi.com',
        'sheba.local',
    ],

    // Dev hosts
    devHosts: ['localhost', '127.0.0.1'],
};
