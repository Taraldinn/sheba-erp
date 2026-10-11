/**
 * API base URL resolution.
 *
 * - VITE_API_BASE_URL: backend origin + version (e.g. https://api.example.com/api/v1)
 * - The hostname resolver decides whether the request goes to /saas/* (central)
 *   or the plain tenant plane.
 */
function resolveEnv(nextPublicVal?: string, viteKey?: string, fallback: string = ''): string {
    if (nextPublicVal && nextPublicVal.trim()) return nextPublicVal.trim();
    if (typeof process !== 'undefined' && process.env && viteKey && process.env[viteKey]) {
        return process.env[viteKey]!.trim();
    }
    try {
        if (viteKey) {
            const v = (import.meta as unknown as { env?: Record<string, string> }).env?.[viteKey];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
    } catch {
        /* not in Vite */
    }
    return fallback;
}

const RAW_API_URL = resolveEnv(
    process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL,
    'VITE_API_BASE_URL',
    'http://localhost:8000/api/v1'
);

const RAW_SAAS_API_URL = resolveEnv(
    process.env.NEXT_PUBLIC_SAAS_API_BASE_URL,
    'VITE_SAAS_API_BASE_URL',
    ''
);

const CLEAN_API_URL = RAW_API_URL.replace(/\/+$/, '');
const CLEAN_SAAS_API_URL = RAW_SAAS_API_URL
    ? RAW_SAAS_API_URL.replace(/\/+$/, '')
    : CLEAN_API_URL.endsWith('/saas')
      ? CLEAN_API_URL
      : `${CLEAN_API_URL}/saas`;

export const API_BASE_URL = CLEAN_API_URL;
export const SAAS_API_BASE_URL = CLEAN_SAAS_API_URL;

export type Plane = 'central' | 'tenant';

export interface ApiBaseUrls {
    central: string;
    tenant: string;
}

export function getApiBaseUrls(): ApiBaseUrls {
    return { central: SAAS_API_BASE_URL, tenant: API_BASE_URL };
}