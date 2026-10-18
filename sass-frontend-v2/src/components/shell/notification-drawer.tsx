'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  ExternalLink,
  Info,
  Radio,
  Server,
  X,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from 'cn';

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  category: 'alerts' | 'billing' | 'system';
  severity: 'critical' | 'warning' | 'info' | 'success';
  read: boolean;
  href?: string;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'MikroTik CCR2004 Core Latency Spike',
    description: 'High ping latency (142ms) observed on Uplink BDI-10 interface.',
    timestamp: '5m ago',
    category: 'alerts',
    severity: 'warning',
    read: false,
    href: '/tenant/routers',
  },
  {
    id: 'notif-2',
    title: '18 Subscriptions Due for Renewal',
    description: 'Automatic invoices generated. 4 accounts awaiting payment confirmation.',
    timestamp: '22m ago',
    category: 'billing',
    severity: 'info',
    read: false,
    href: '/tenant/subscriptions',
  },
  {
    id: 'notif-3',
    title: 'OLT PON Port 4 Re-synchronized',
    description: 'Optical power levels stabilized at -18.4 dBm across 32 active ONUs.',
    timestamp: '1h ago',
    category: 'alerts',
    severity: 'success',
    read: false,
    href: '/tenant/olts',
  },
  {
    id: 'notif-4',
    title: 'Radius Secret Key Re-authenticated',
    description: 'Daily background synchronization finished with zero lease mismatches.',
    timestamp: '3h ago',
    category: 'system',
    severity: 'info',
    read: true,
    href: '/tenant/settings',
  },
];

export function NotificationDrawer({
  open,
  onOpenChange,
  unreadCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount?: number;
}) {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  const activeUnreadCount = unreadCount ?? notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const markSingleAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  };

  const renderList = (categoryFilter?: 'alerts' | 'billing') => {
    const items = categoryFilter
      ? notifications.filter((n) => n.category === categoryFilter)
      : notifications;

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Bell className="size-8 stroke-1 text-muted-foreground/50 mb-2" />
          <p className="text-xs font-medium">All clear! No notifications here.</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-border overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => markSingleAsRead(item.id)}
            className={cn(
              'group relative flex flex-col gap-1.5 p-4 text-xs transition-colors hover:bg-muted/40 cursor-pointer',
              !item.read && 'bg-accent/15'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {!item.read && (
                  <span className="size-1.5 rounded-full bg-primary shrink-0" />
                )}
                {item.category === 'alerts' && (
                  <AlertTriangle
                    className={cn(
                      'size-3.5 shrink-0',
                      item.severity === 'warning' ? 'text-warning' : 'text-destructive'
                    )}
                  />
                )}
                {item.category === 'billing' && (
                  <CreditCard className="size-3.5 shrink-0 text-primary" />
                )}
                {item.category === 'system' && (
                  <Info className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className={cn('font-medium leading-none', !item.read && 'text-foreground font-semibold')}>
                  {item.title}
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {item.timestamp}
              </span>
            </div>

            <p className="text-muted-foreground pl-3.5 text-[11px] leading-relaxed">
              {item.description}
            </p>

            {item.href && (
              <div className="pl-3.5 pt-1">
                <Link
                  href={item.href as never}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
                >
                  View Details <ExternalLink className="size-2.5" />
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col p-0 w-full sm:max-w-md border-l border-border bg-card"
      >
        <SheetHeader className="border-b border-border p-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-sm font-semibold">Notifications & Alerts</SheetTitle>
              {activeUnreadCount > 0 && (
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4">
                  {activeUnreadCount} new
                </Badge>
              )}
            </div>
            {activeUnreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="all" className="flex flex-col flex-1 overflow-hidden">
          <div className="border-b border-border px-4 py-2 bg-muted/20">
            <TabsList className="grid w-full grid-cols-3 h-8">
              <TabsTrigger value="all" className="text-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs">
                Alerts
              </TabsTrigger>
              <TabsTrigger value="billing" className="text-xs">
                Billing
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="flex-1 m-0 overflow-y-auto">
            {renderList()}
          </TabsContent>
          <TabsContent value="alerts" className="flex-1 m-0 overflow-y-auto">
            {renderList('alerts')}
          </TabsContent>
          <TabsContent value="billing" className="flex-1 m-0 overflow-y-auto">
            {renderList('billing')}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
