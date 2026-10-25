import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OnboardingStatusCard } from '@/components/onboarding/onboarding-status-card';

describe('OnboardingStatusCard', () => {
    it('displays pending review state with organization details', () => {
        render(
            <OnboardingStatusCard
                status="pending"
                organizationName="Dhaka Net"
                requestedSlug="dhaka-net"
                plan="Standard"
            />
        );
        expect(screen.getByText(/pending review/i)).toBeDefined();
        expect(screen.getByText(/dhaka net/i)).toBeDefined();
    });

    it('displays approved state with workspace launch button', () => {
        render(
            <OnboardingStatusCard
                status="approved"
                organizationName="Dhaka Net"
                requestedSlug="dhaka-net"
                plan="Standard"
            />
        );
        expect(screen.getByText(/approved & active/i)).toBeDefined();
        expect(screen.getByRole('link', { name: /launch workspace/i })).toBeDefined();
    });

    it('displays rejected state with rejection reason', () => {
        render(
            <OnboardingStatusCard
                status="rejected"
                organizationName="Dhaka Net"
                requestedSlug="dhaka-net"
                plan="Standard"
                rejectionReason="Invalid trade license provided."
            />
        );
        expect(screen.getByText(/rejected/i)).toBeDefined();
        expect(screen.getByText(/invalid trade license provided/i)).toBeDefined();
    });
});
