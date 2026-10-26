'use client';

import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

export function getCookieDomain(hostname: string): string | undefined {
    if (hostname.endsWith('shebafi.xyz')) {
        return '.shebafi.xyz';
    }
    return undefined;
}

const authUrl =
    typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_NEON_AUTH_URL || window.location.origin)
        : (process.env.NEXT_PUBLIC_NEON_AUTH_URL || 'http://app.localhost:3000');

export const authClient = createAuthClient(authUrl, {
    adapter: BetterAuthReactAdapter(),
});

export const { signIn, signUp, useSession, signOut } = authClient;
