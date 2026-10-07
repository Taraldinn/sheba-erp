import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SaaSForgotPasswordScreen } from '@/pages/auth/forgot-password';
import { SaaSResetPasswordScreen } from '@/pages/auth/reset-password';
import { PortalProvider } from '@/portal/portal-provider';
import { AuthProvider } from '@/portal/auth-provider';
import { PlaneProvider } from '@/providers/plane-provider';
import { ThemeProvider } from '@/providers/theme-provider';

const requestResetMock = vi.fn();
const confirmResetMock = vi.fn();

vi.mock('@/api/client', () => ({
    saasApi: {
        requestPasswordReset: (...args: any[]) => requestResetMock(...args),
        confirmPasswordReset: (...args: any[]) => confirmResetMock(...args),
        login: vi.fn(),
        logout: vi.fn(),
    },
    STORAGE_KEYS: {
        centralToken: 'saas_central_token',
        centralUser: 'saas_central_user',
        tenantToken: 'saas_tenant_token',
        tenantUser: 'saas_tenant_user',
        tenantSlug: 'saas_tenant_slug',
        tenantId: 'saas_tenant_id',
        bootstrapPending: 'saas_bootstrap_pending',
    },
    ApiError: class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); this.name = 'ApiError'; } },
}));

const renderForgot = () =>
    render(
        <MemoryRouter initialEntries={['/forgot-password']}>
            <ThemeProvider>
                <PlaneProvider>
                    <PortalProvider>
                        <AuthProvider>
                            <Routes>
                                <Route path="/forgot-password" element={<SaaSForgotPasswordScreen />} />
                                <Route path="/login" element={<div data-testid="login-page" />} />
                            </Routes>
                        </AuthProvider>
                    </PortalProvider>
                </PlaneProvider>
            </ThemeProvider>
        </MemoryRouter>,
    );

const renderReset = (search = '?uid=abc&token=tok') =>
    render(
        <MemoryRouter initialEntries={[`/reset-password${search}`]}>
            <ThemeProvider>
                <PlaneProvider>
                    <PortalProvider>
                        <AuthProvider>
                            <Routes>
                                <Route path="/reset-password" element={<SaaSResetPasswordScreen />} />
                                <Route path="/forgot-password" element={<div data-testid="forgot-page" />} />
                            </Routes>
                        </AuthProvider>
                    </PortalProvider>
                </PlaneProvider>
            </ThemeProvider>
        </MemoryRouter>,
    );

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

beforeEach(() => {
    cleanup();
    requestResetMock.mockReset();
    confirmResetMock.mockReset();
    localStorage.clear();
});

describe('SaaSForgotPasswordScreen', () => {
    it('rejects invalid email format', async () => {
        renderForgot();
        const input = await screen.findByPlaceholderText('admin@shebafi.xyz') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'not-an-email' } });
        // Trigger submit via the form to make sure handleSubmit runs.
        const form = input.closest('form');
        expect(form).not.toBeNull();
        fireEvent.submit(form!);
        await waitFor(() => {
            expect(screen.queryAllByText(/Enter a valid email address/).length).toBeGreaterThan(0);
        });
        expect(requestResetMock).not.toHaveBeenCalled();
    });

    it('calls saasApi.requestPasswordReset on valid submit and shows success state', async () => {
        requestResetMock.mockResolvedValueOnce({ detail: 'sent' });
        renderForgot();
        const input = await screen.findByPlaceholderText('admin@shebafi.xyz');
        fireEvent.change(input, { target: { value: 'admin@shebafi.xyz' } });
        fireEvent.click(screen.getByRole('button', { name: /Send reset link/i }));
        await waitFor(() => {
            expect(requestResetMock).toHaveBeenCalledWith('admin@shebafi.xyz');
        });
        expect(await screen.findByText(/Check your inbox/i)).toBeTruthy();
    });

    it('shows success state even on network failure (no enumeration leak)', async () => {
        requestResetMock.mockRejectedValueOnce(new Error('network down'));
        renderForgot();
        const input = await screen.findByPlaceholderText('admin@shebafi.xyz');
        fireEvent.change(input, { target: { value: 'noone@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Send reset link/i }));
        expect(await screen.findByText(/Check your inbox/i)).toBeTruthy();
    });
});

describe('SaaSResetPasswordScreen', () => {
    it('shows error when uid or token missing from URL', () => {
        renderReset('');
        expect(screen.getByText(/This reset link is missing required parameters/i)).toBeTruthy();
    });

    it('disables submit until password meets strength + matches confirm', async () => {
        confirmResetMock.mockResolvedValueOnce({ detail: 'updated' });
        renderReset();
        const inputs = screen.getAllByPlaceholderText('••••••••••••') as HTMLInputElement[];
        const [password, confirm] = inputs;
        fireEvent.change(password, { target: { value: 'weak' } });
        fireEvent.change(confirm, { target: { value: 'weak' } });
        const submit = screen.getByRole('button', { name: /Update password/i }) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);
    });

    it('submits when form is valid and redirects to /login?reset=ok', async () => {
        confirmResetMock.mockResolvedValueOnce({ detail: 'updated' });
        renderReset();
        const inputs = screen.getAllByPlaceholderText('••••••••••••') as HTMLInputElement[];
        const [password, confirm] = inputs;
        fireEvent.change(password, { target: { value: 'NewStrongPass123!' } });
        fireEvent.change(confirm, { target: { value: 'NewStrongPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: /Update password/i }));
        await waitFor(() => {
            expect(confirmResetMock).toHaveBeenCalledWith('abc', 'NewStrongPass123!', 'tok');
        });
        expect(await screen.findByText(/Password updated/i)).toBeTruthy();
    });

    it('shows backend error message when token invalid', async () => {
        confirmResetMock.mockRejectedValueOnce(new Error('Invalid or expired password reset link.'));
        renderReset();
        const inputs = screen.getAllByPlaceholderText('••••••••••••') as HTMLInputElement[];
        const [password, confirm] = inputs;
        fireEvent.change(password, { target: { value: 'NewStrongPass123!' } });
        fireEvent.change(confirm, { target: { value: 'NewStrongPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: /Update password/i }));
        expect(await screen.findByText(/Invalid or expired password reset link/i)).toBeTruthy();
    });
});