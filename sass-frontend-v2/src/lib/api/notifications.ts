import { fetchApi, toQuery } from './client';
import type { Notification } from './types';

export const notificationsApi = {
    list: (params?: { page?: number; page_size?: number; is_read?: boolean }) =>
        fetchApi<{ count: number; results: Notification[] } | Notification[]>(`/notifications/${toQuery(params as Record<string, unknown>)}`, { plane: 'tenant' }),
    unreadCount: () => fetchApi<{ unread_count: number }>('/notifications/unread-count/', { plane: 'tenant' }),
    markAsRead: (id: string) => fetchApi<{ status: string; id: string }>(`/notifications/${id}/mark-as-read/`, { method: 'POST', plane: 'tenant' }),
    markAllRead: () => fetchApi<{ status: string; count: number }>('/notifications/mark-all-read/', { method: 'POST', plane: 'tenant' }),
};