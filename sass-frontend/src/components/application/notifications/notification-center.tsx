import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell01, Check, AlertCircle, InfoCircle } from '@untitledui/icons';
import { notificationsApi, type NotificationItem } from '@/api/client';
import { Badge } from '@/components/base/badges/badges';

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const countData = await notificationsApi.getUnreadCount();
            setUnreadCount(countData.unread_count || 0);

            const listData = await notificationsApi.list({ page_size: 15 });
            const items = Array.isArray(listData) ? listData : (listData.results || []);
            setNotifications(items);
        } catch {
            // Silently handle if unauthenticated or offline
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // 30s background poll
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await notificationsApi.markAsRead(id);
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
            );
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            setIsLoading(true);
            await notificationsApi.markAllRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to mark all notifications as read:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'urgent':
                return <Badge size="sm" color="error">Urgent</Badge>;
            case 'high':
                return <Badge size="sm" color="warning">High</Badge>;
            default:
                return null;
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                className="relative rounded-lg p-2 text-tertiary hover:bg-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-brand"
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen) fetchNotifications();
                }}
                aria-label="Notifications"
            >
                <Bell01 className="size-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-error-primary text-[10px] font-bold text-white shadow-xs">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-secondary bg-primary shadow-xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-secondary px-4 py-3 bg-secondary/50">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-primary">Notifications</h4>
                            {unreadCount > 0 && (
                                <Badge size="sm" color="brand">{unreadCount} unread</Badge>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                className="text-xs text-brand-primary hover:underline font-medium disabled:opacity-50"
                                onClick={handleMarkAllRead}
                                disabled={isLoading}
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    {/* Content List */}
                    <div className="max-h-96 overflow-y-auto divide-y divide-secondary">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center text-tertiary px-4">
                                <InfoCircle className="size-8 text-quaternary mb-2" />
                                <p className="text-sm font-medium text-secondary">No notifications</p>
                                <p className="text-xs text-tertiary mt-0.5">You are completely up to date.</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`flex items-start gap-3 p-3.5 transition-colors hover:bg-secondary/40 ${
                                        !n.is_read ? 'bg-brand-primary/5' : ''
                                    }`}
                                >
                                    <div className="mt-0.5 text-brand-primary">
                                        <AlertCircle className="size-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <p className="text-xs font-semibold text-primary truncate">
                                                {n.title}
                                            </p>
                                            {getPriorityBadge(n.priority)}
                                        </div>
                                        <p className="text-xs text-secondary line-clamp-2 leading-relaxed">
                                            {n.message}
                                        </p>
                                        <div className="flex items-center justify-between mt-2 pt-1 text-[11px] text-quaternary">
                                            <span>
                                                {new Date(n.created_at).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                            {!n.is_read && (
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-1 text-brand-primary hover:text-brand-secondary"
                                                    onClick={(e) => handleMarkAsRead(n.id, e)}
                                                >
                                                    <Check className="size-3" />
                                                    <span>Mark read</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
