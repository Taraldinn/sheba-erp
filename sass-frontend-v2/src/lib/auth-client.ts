'use client';

import { createAuthClient } from '@neondatabase/auth/next';

export function getCookieDomain(hostname: string): string | undefined {
    if (hostname.endsWith('shebafi.xyz')) {
        return '.shebafi.xyz';
    }
    return undefined;
}

/**
 * Neon Managed Better Auth client for the Organization portal.
 *
 * Takes no arguments on purpose: it talks to the same-origin proxy at
 * `/api/auth/*` (see `app/api/auth/[...all]/route.ts`), which forwards to
 * NEON_AUTH_BASE_URL and manages the session cookie.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, useSession, signOut } = authClient;
