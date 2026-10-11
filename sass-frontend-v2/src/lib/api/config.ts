/**
 * API base URL resolution.
 *
 * - VITE_API_BASE_URL: backend origin + version (e.g. https://api.example.com/api/v1)
 * - The hostname resolver decides whether the request goes to /saas/* (central)
 *   or the plain tenant plane.
 */
const RAW_API_URL =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ||
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ||
    'http://localhost:8000/api/v1';

const CLEAN_API_URL = RAW_API_URL.replace(/\/+$/, '');

export const API_BASE_URL = CLEAN_API_URL;
export const SAAS_API_BASE_URL = CLEAN_API_URL.endsWith('/saas') ? CLEAN_API_URL : `${CLEAN_API_URL}/saas`;

export type Plane = 'central' | 'tenant';

export interface ApiBaseUrls {
    central: string;
    tenant: string;
}

export function getApiBaseUrls(): ApiBaseUrls {
    return { central: SAAS_API_BASE_URL, tenant: API_BASE_URL };
}