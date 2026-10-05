import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';

import { DataTable } from '@/components/application/table/data-table';
import { NotificationCenter } from '@/components/application/notifications/notification-center';
import { CommandMenu } from '@/components/application/command-menu/command-menu';
import { notificationsApi, searchApi, tenantApi } from '@/api/client';

describe('AppShell Primitives & Real APIs', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('DataTable Component', () => {
        const sampleData = [
            { id: '1', name: 'John Doe', username: 'john01', plan: '50 Mbps' },
            { id: '2', name: 'Jane Smith', username: 'jane02', plan: '100 Mbps' },
        ];

        const columns = [
            { key: 'name', label: 'Customer Name', sortable: true },
            { key: 'username', label: 'PPPoE Username' },
            { key: 'plan', label: 'Package' },
        ];

        it('renders data rows and server pagination info', () => {
            const onPageChange = vi.fn();
            render(
                <DataTable
                    title="Active Subscribers"
                    columns={columns}
                    data={sampleData}
                    totalCount={50}
                    page={1}
                    pageSize={10}
                    onPageChange={onPageChange}
                />
            );

            expect(screen.getByText('Active Subscribers')).toBeDefined();
            expect(screen.getByText('John Doe')).toBeDefined();
            expect(screen.getByText('Jane Smith')).toBeDefined();
            expect(screen.getByText((_, el) => el?.textContent?.replace(/\s+/g, ' ').trim() === 'Showing 1 to 10 of 50 results')).toBeDefined();
        });

        it('triggers sort callback when clicking sortable header', () => {
            const onSortChange = vi.fn();
            render(
                <DataTable
                    columns={columns}
                    data={sampleData}
                    totalCount={2}
                    page={1}
                    pageSize={10}
                    onPageChange={vi.fn()}
                    onSortChange={onSortChange}
                    sortField="name"
                    sortDirection="asc"
                />
            );

            const header = screen.getByText('Customer Name');
            fireEvent.click(header);
            expect(onSortChange).toHaveBeenCalledWith('name', 'desc');
        });

        it('displays empty state when data is empty and not loading', () => {
            render(
                <DataTable
                    columns={columns}
                    data={[]}
                    totalCount={0}
                    page={1}
                    pageSize={10}
                    onPageChange={vi.fn()}
                    emptyMessage="No customers found"
                />
            );

            expect(screen.getByText('No customers found')).toBeDefined();
        });
    });

    describe('NotificationCenter Component', () => {
        it('renders notification trigger and shows badge when unread > 0', async () => {
            vi.spyOn(notificationsApi, 'getUnreadCount').mockResolvedValue({ unread_count: 3 });
            vi.spyOn(notificationsApi, 'list').mockResolvedValue([
                {
                    id: 'notif-1',
                    title: 'Router Down',
                    message: 'Core router offline',
                    category: 'network',
                    priority: 'high',
                    is_read: false,
                    created_at: new Date().toISOString(),
                },
            ]);

            render(<NotificationCenter />);

            await waitFor(() => {
                expect(screen.getByText('3')).toBeDefined();
            });

            // Click bell icon to open dropdown
            const button = screen.getByLabelText('Notifications');
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByText('Router Down')).toBeDefined();
                expect(screen.getByText('Core router offline')).toBeDefined();
                expect(screen.getByText('3 unread')).toBeDefined();
            });
        });
    });

    describe('CommandMenu Component', () => {
        it('searches backend records and displays results', async () => {
            vi.spyOn(searchApi, 'global').mockResolvedValue({
                query: 'alpha',
                count: 1,
                results: [
                    {
                        id: 'res-1',
                        type: 'customer',
                        title: 'Alpha Customer',
                        subtitle: 'PPPoE: alpha · 01700000000',
                        url: '/customers?search=alpha',
                        icon: 'user',
                    },
                ],
            });

            render(
                <MemoryRouter>
                    <CommandMenu isOpen={true} onClose={vi.fn()} />
                </MemoryRouter>
            );

            const input = screen.getByPlaceholderText(/Search customers/i);
            fireEvent.change(input, { target: { value: 'alpha' } });

            await waitFor(() => {
                expect(screen.getByText('Alpha Customer')).toBeDefined();
                expect(screen.getByText('PPPoE: alpha · 01700000000')).toBeDefined();
            });
        });
    });

    describe('API Service Contracts', () => {
        it('has tenantApi.resolve method', () => {
            expect(typeof tenantApi.resolve).toBe('function');
        });

        it('has notificationsApi methods', () => {
            expect(typeof notificationsApi.list).toBe('function');
            expect(typeof notificationsApi.getUnreadCount).toBe('function');
            expect(typeof notificationsApi.markAsRead).toBe('function');
            expect(typeof notificationsApi.markAllRead).toBe('function');
        });

        it('has searchApi.global method', () => {
            expect(typeof searchApi.global).toBe('function');
        });
    });
});
