import { createNeonAuth } from '@neondatabase/auth/next/server';

/**
 * Server-side Neon Managed Better Auth instance.
 *
 * Required env (see .env.example):
 *   NEON_AUTH_BASE_URL       – branch Auth URL from the Neon console
 *   NEON_AUTH_COOKIE_SECRET  – 32+ chars (`openssl rand -base64 32`)
 */
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
const isProd = process.env.NODE_ENV === 'production';

function required(name: string, devFallback?: string): string {
    const value = process.env[name];
    if (value) return value;
    // Don't break `next build` in CI/Docker where runtime env isn't present yet.
    if (isBuild) return devFallback ?? 'build-placeholder-not-for-runtime-use-0000';
    if (!isProd && devFallback) return devFallback;
    throw new Error(`Missing required environment variable ${name} (Neon Auth). See .env.example.`);
}

export const auth = createNeonAuth({
    baseUrl: required('NEON_AUTH_BASE_URL', 'https://placeholder.invalid/neondb/auth'),
    cookies: {
        secret: required('NEON_AUTH_COOKIE_SECRET', 'dev-only-secret-change-me-0123456789abcdef'),
        domain: process.env.NEON_AUTH_COOKIE_DOMAIN || (isProd ? '.shebafi.xyz' : undefined),
    },
});
