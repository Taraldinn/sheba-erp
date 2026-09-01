"use client";

import { useState, useEffect } from "react";
import { Bell, Check, X, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notification } from "@/types";
import { useNotifications } from "@/hooks/useNotifications";
import Link from "next/link";

const iconMap: Record<string, React.ReactNode> = {
  MessageSquare: <Bell className="h-4 w-4" />,
  CreditCard: <Bell className="h-4 w-4" />,
  AlertCircle: <Bell className="h-4 w-4" />,
  AlertTriangle: <Bell className="h-4 w-4" />,
};

const priorityBgColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 border-red-500/20",
  high: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  low: "bg-blue-500/10 text-blue-700 border-blue-500/20",
};

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearNotification,
  } = useNotifications();

  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const filtered = notifications.filter((n) => {
    if (filterType !== "all" && n.type !== filterType) return false;
    if (filterPriority !== "all" && n.priority !== filterPriority) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="border-b border-border/80 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Bell className="h-6 w-6 text-indigo-500" />
          Notifications
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          {unreadCount} unread · {notifications.length} total
        </p>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          <Badge
            variant={filterType === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilterType("all")}
          >
            All
          </Badge>
          {["ticket", "payment", "customer", "network", "system"].map((type) => (
            <Badge
              key={type}
              variant={filterType === type ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => setFilterType(type)}
            >
              {type}
            </Badge>
          ))}
        </div>

        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            disabled={loading}
            className="text-xs"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading && notifications.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 text-muted-foreground mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">No notifications found</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filtered.map((notification) => (
            <Card
              key={notification.id}
              className={`border ${priorityBgColors[notification.priority]} cursor-pointer transition-all hover:shadow-md ${
                !notification.read ? "ring-1 ring-indigo-500" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Priority Badge */}
                  <div className="flex-shrink-0 mt-1">
                    <Badge
                      variant="outline"
                      className={`capitalize text-[10px] ${priorityBgColors[notification.priority]}`}
                    >
                      {notification.priority}
                    </Badge>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-sm text-foreground">
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <div className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1" />
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">
                      {notification.message}
                    </p>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(notification.created_at).toLocaleString()}
                      </span>

                      {notification.action_url && (
                        <Link href={notification.action_url}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                            className="text-xs h-auto px-2 py-1"
                          >
                            {notification.action_label}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(notification.id)}
                        className="h-auto p-1"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearNotification(notification.id)}
                      className="h-auto p-1"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
