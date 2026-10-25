import { createNeonAuth } from '@neondatabase/auth/next/server';

const baseUrl = process.env.NEON_AUTH_BASE_URL || 'https://auth.neon.tech';
const secret = process.env.NEON_AUTH_COOKIE_SECRET || 'dev-secret-replace-in-production-12345678-long-enough';

export const auth = createNeonAuth({
    baseUrl,
    cookies: {
        secret,
    },
});
