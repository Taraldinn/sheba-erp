import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BetterAuthCard } from '@/components/auth/better-auth-card';

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
    }),
}));

// Mock auth client
vi.mock('@/lib/auth-client', () => ({
    signIn: {
        social: vi.fn(),
        email: vi.fn(),
    },
    signUp: {
        email: vi.fn(),
    },
    useSession: vi.fn(() => ({ data: null, isPending: false })),
}));

describe('BetterAuthCard', () => {
    it('renders Google direct login button and credential inputs for signin', () => {
        render(<BetterAuthCard mode="signin" />);
        expect(screen.getByRole('button', { name: /continue with google/i })).toBeDefined();
        expect(screen.getByPlaceholderText(/username or email/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/password/i)).toBeDefined();
    });

    it('renders signup fields including username and email when mode is signup', () => {
        render(<BetterAuthCard mode="signup" />);
        expect(screen.getByRole('button', { name: /sign up with google/i })).toBeDefined();
        expect(screen.getByPlaceholderText(/full name/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/username/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/email address/i)).toBeDefined();
    });
});
