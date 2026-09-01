"use client";

import { useState, useCallback, useEffect } from "react";
import { Notification } from "@/types";
import { ApiClient } from "@/lib/api";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch various data sources and generate notifications
      const [tickets, transactions, customers, routers] = await Promise.all([
        ApiClient.getTickets(),
        ApiClient.getTransactions(),
        ApiClient.getCustomers(),
        ApiClient.getRouters(),
      ]);

      const generatedNotifications: Notification[] = [];

      // Open tickets notification
      const openTickets = tickets.filter((t) => t.status === "Open");
      if (openTickets.length > 0) {
        openTickets.slice(0, 3).forEach((ticket) => {
          generatedNotifications.push({
            id: `ticket-${ticket.id}`,
            type: "ticket",
            priority: ticket.priority.toLowerCase() as any,
            title: `${ticket.priority} Support Ticket`,
            message: `${ticket.subject} from ${ticket.customer_name || "Unknown"}`,
            icon: "MessageSquare",
            action_url: `/support?tab=open&id=${ticket.id}`,
            action_label: "View Ticket",
            read: false,
            created_at: ticket.created_at,
            related_id: ticket.id,
          });
        });
      }

      // Failed/Pending payments
      const failedPayments = transactions.filter((t) => t.status === "Failed" || t.status === "Pending");
      if (failedPayments.length > 0) {
        failedPayments.slice(0, 2).forEach((payment) => {
          generatedNotifications.push({
            id: `payment-${payment.id}`,
            type: "payment",
            priority: payment.status === "Failed" ? "high" : "medium",
            title: `Payment ${payment.status}`,
            message: `${payment.customer_name || "Unknown"} - ৳${payment.amount}`,
            icon: "CreditCard",
            action_url: `/payments?search=${payment.customer_name}`,
            action_label: "View Payment",
            read: false,
            created_at: payment.created_at,
            related_id: payment.id,
          });
        });
      }

      // Customers expiring soon
      const expiringCustomers = customers.filter((c) => {
        if (!c.expiry_date || c.status !== "Active") return false;
        const days = Math.floor(
          (new Date(c.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        return days > 0 && days <= 7;
      });

      if (expiringCustomers.length > 0) {
        expiringCustomers.slice(0, 2).forEach((customer) => {
          const days = Math.floor(
            (new Date(customer.expiry_date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );
          generatedNotifications.push({
            id: `customer-${customer.id}`,
            type: "customer",
            priority: days <= 3 ? "high" : "medium",
            title: "Customer Expiring Soon",
            message: `${customer.full_name} expires in ${days} days`,
            icon: "AlertCircle",
            action_url: `/customers?search=${customer.customer_code}`,
            action_label: "View Customer",
            read: false,
            created_at: new Date().toISOString(),
            related_id: customer.id,
          });
        });
      }

      // Offline routers
      const offlineRouters = routers.filter((r) => r.status === "Offline");
      if (offlineRouters.length > 0) {
        offlineRouters.forEach((router) => {
          generatedNotifications.push({
            id: `router-${router.id}`,
            type: "network",
            priority: "critical",
            title: "Router Offline",
            message: `${router.name} at ${router.location} is offline`,
            icon: "AlertTriangle",
            action_url: `/routers?search=${router.name}`,
            action_label: "View Router",
            read: false,
            created_at: new Date().toISOString(),
            related_id: router.id,
          });
        });
      }

      // Sort by priority and date
      const sorted = generatedNotifications.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff =
          priorityOrder[a.priority as keyof typeof priorityOrder] -
          priorityOrder[b.priority as keyof typeof priorityOrder];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setNotifications(sorted.slice(0, 10)); // Limit to 10 most recent
      setUnreadCount(sorted.filter((n) => !n.read).length);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const clearNotification = useCallback((notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  }, []);

  // Fetch on mount and every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearNotification,
  };
}
