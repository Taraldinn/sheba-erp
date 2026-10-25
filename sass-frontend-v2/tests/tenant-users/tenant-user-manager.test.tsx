import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TenantUserManager } from '@/components/tenant-users/tenant-user-manager';

// Mock API call to prevent network requests
vi.mock('@/lib/api/saas', () => ({
    saasApi: {
        getTenantStaffAccounts: vi.fn().mockResolvedValue({ results: [], count: 0 }),
        createTenantStaffAccount: vi.fn().mockResolvedValue({
            id: 101,
            username: 'jdoe',
            email: 'jdoe@test.com',
            role: 'ADMIN',
        }),
    },
}));

describe('TenantUserManager', () => {
    it('renders empty state when no staff accounts exist', async () => {
        render(<TenantUserManager tenantId="test-tenant-123" tenantSlug="dhaka-net" initialStaff={[]} />);
        expect(screen.getByText(/workspace staff accounts/i)).toBeDefined();
        expect(await screen.findByText(/no operational staff accounts yet/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /add staff member/i })).toBeDefined();
    });

    it('renders staff list when accounts are provided', () => {
        const staff = [
            {
                id: 1,
                username: 'alice_admin',
                email: 'alice@dhakanet.com',
                role: 'ADMIN',
                first_name: 'Alice',
                last_name: 'Smith',
            },
            {
                id: 2,
                username: 'bob_tech',
                email: 'bob@dhakanet.com',
                role: 'TECHNICIAN',
            },
        ];
        render(<TenantUserManager tenantId="test-tenant-123" tenantSlug="dhaka-net" initialStaff={staff} />);
        expect(screen.getByText('alice_admin')).toBeDefined();
        expect(screen.getByText('alice@dhakanet.com')).toBeDefined();
        expect(screen.getByText('bob_tech')).toBeDefined();
        expect(screen.getByText('TECHNICIAN')).toBeDefined();
    });

    it('opens account creation modal when add staff button is clicked', () => {
        render(<TenantUserManager tenantId="test-tenant-123" tenantSlug="dhaka-net" initialStaff={[]} />);
        const addButton = screen.getByRole('button', { name: /add staff member/i });
        fireEvent.click(addButton);

        expect(screen.getByText(/provision tenant staff account/i)).toBeDefined();
        expect(screen.getByLabelText(/username/i)).toBeDefined();
        expect(screen.getByLabelText(/initial password/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /create account/i })).toBeDefined();
    });
});
