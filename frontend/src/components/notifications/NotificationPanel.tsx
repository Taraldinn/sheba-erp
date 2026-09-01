"use client";

import { Notification } from "@/types";
import {
  MessageSquare,
  CreditCard,
  AlertCircle,
  AlertTriangle,
  Check,
  X,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface NotificationPanelProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClear: (id: string) => void;
  unreadCount: number;
  loading: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="h-4 w-4" />,
  CreditCard: <CreditCard className="h-4 w-4" />,
  AlertCircle: <AlertCircle className="h-4 w-4" />,
  AlertTriangle: <AlertTriangle className="h-4 w-4" />,
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

const typeColors: Record<string, string> = {
  ticket: "bg-indigo-500/10 border-indigo-500/20",
  payment: "bg-emerald-500/10 border-emerald-500/20",
  customer: "bg-purple-500/10 border-purple-500/20",
  network: "bg-red-500/10 border-red-500/20",
  system: "bg-slate-500/10 border-slate-500/20",
};

export function NotificationPanel({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClear,
  unreadCount,
  loading,
}: NotificationPanelProps) {
  if (notifications.length === 0 && !loading) {
    return (
      <div className="w-96 p-8 text-center">
        <div className="text-muted-foreground text-sm">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No notifications</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 max-h-96 overflow-hidden flex flex-col bg-card border border-border rounded-lg shadow-lg">
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 bg-muted/40">
        <div>
          <h3 className="font-bold text-sm text-foreground">Notifications</h3>
          {unreadCount > 0 && (
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllAsRead}
            className="text-xs h-auto px-2 py-1"
          >
            <Check className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto space-y-1 p-2">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-3 rounded-lg border transition-all ${typeColors[notification.type]} ${
                !notification.read ? "ring-1 ring-indigo-500" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div
                  className={`flex-shrink-0 mt-0.5 ${priorityColors[notification.priority]} p-1.5 rounded-md`}
                >
                  {iconMap[notification.icon] || iconMap.AlertCircle}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4 className="text-xs font-semibold text-foreground leading-tight">
                        {notification.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1" />
                    )}
                  </div>

                  {/* Action */}
                  {notification.action_url && (
                    <Link href={notification.action_url}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onMarkAsRead(notification.id)}
                        className="text-xs h-auto px-2 py-1 mt-2 text-indigo-500 hover:text-indigo-600"
                      >
                        {notification.action_label}
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>

                {/* Close Button */}
                <button
                  onClick={() => onClear(notification.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="sticky bottom-0 px-4 py-2 border-t border-border/60 bg-muted/20">
          <Link href="/notifications">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-indigo-500 hover:text-indigo-600"
            >
              View all notifications
              <ChevronRight className="h-3 w-3 ml-auto" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
