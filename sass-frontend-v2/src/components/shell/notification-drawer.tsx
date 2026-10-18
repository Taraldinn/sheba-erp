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
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <div className="size-10 rounded-full border border-border/60 bg-muted/20 flex items-center justify-center mb-3">
            <Bell className="size-4 stroke-1 text-muted-foreground/60" />
          </div>
          <p className="text-xs font-medium tracking-tight">All caught up</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">No new notifications in this category</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-border/40 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => markSingleAsRead(item.id)}
            className={cn(
              'group relative flex flex-col gap-1.5 p-4 text-xs transition-all duration-150 hover:bg-muted/30 cursor-pointer',
              !item.read && 'bg-primary/[0.03]'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {!item.read && (
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
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
                <span className={cn('font-medium leading-none tracking-tight', !item.read ? 'text-foreground font-semibold' : 'text-foreground/80')}>
                  {item.title}
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground/70 shrink-0">
                {item.timestamp}
              </span>
            </div>

            <p className="text-muted-foreground/80 pl-4 text-[11px] leading-relaxed">
              {item.description}
            </p>

            {item.href && (
              <div className="pl-4 pt-1">
                <Link
                  href={item.href as never}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-primary/90 hover:text-primary transition-colors hover:underline"
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
        className="flex flex-col p-0 w-full sm:max-w-md border-l border-border/70 bg-card/90 backdrop-blur-2xl shadow-2xl luxury-sheen"
      >
        <SheetHeader className="border-b border-border/50 p-4 pb-3 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <SheetTitle className="text-sm font-semibold tracking-tight">Notifications & Alerts</SheetTitle>
              {activeUnreadCount > 0 && (
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4 rounded-full border border-primary/20 bg-primary/10 text-primary">
                  {activeUnreadCount} new
                </Badge>
              )}
            </div>
            {activeUnreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-6 gap-1 px-2 text-[10px] font-mono text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="size-3" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="all" className="flex flex-col flex-1 overflow-hidden">
          <div className="border-b border-border/40 px-4 py-2 bg-muted/15">
            <TabsList className="grid w-full grid-cols-3 h-8 bg-muted/30 p-0.5 rounded-lg border border-border/40">
              <TabsTrigger value="all" className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-xs">
                Alerts
              </TabsTrigger>
              <TabsTrigger value="billing" className="text-xs rounded-md data-[state=active]:bg-card data-[state=active]:shadow-xs">
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
