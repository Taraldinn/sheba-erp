"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Headphones, User, CheckCircle2, Clock, AlertCircle, X } from "lucide-react";
import { PortalApiClient } from "@/lib/portal-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ReplyItem {
  id: string | number;
  message: string;
  sender_name?: string;
  is_staff: boolean;
  created_at?: string;
}

interface TicketDetail {
  id: string;
  ticket_no: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  created_at?: string;
  replies?: ReplyItem[];
}

interface ThreadedTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: TicketDetail | null;
  onTicketUpdated?: () => void;
}

export function ThreadedTicketModal({
  isOpen,
  onClose,
  ticket,
  onTicketUpdated,
}: ThreadedTicketModalProps) {
  const [ticketData, setTicketData] = useState<TicketDetail | null>(ticket);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReplyText("");
    if (!isOpen || !ticket?.id) {
      setTicketData(null);
      setError(null);
      return;
    }

    setTicketData(ticket);

    const loadThread = async () => {
      setLoadingThread(true);
      setError(null);
      try {
        if (PortalApiClient.isAuthenticated()) {
          const res = await PortalApiClient.getTicketThread(ticket.id);
          setTicketData(res);
        }
      } catch (err: any) {
        console.warn("Could not fetch latest thread from API, using cached ticket object:", err);
      } finally {
        setLoadingThread(false);
      }
    };

    loadThread();
  }, [isOpen, ticket?.id]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [isOpen, ticketData?.replies]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !ticketData?.id) return;

    setSubmitting(true);
    setError(null);
    try {
      if (PortalApiClient.isAuthenticated()) {
        await PortalApiClient.replyTicket(ticketData.id, replyText.trim());
        const updated = await PortalApiClient.getTicketThread(ticketData.id);
        setTicketData(updated);
      } else {
        // Demo optimistic response
        const newReply: ReplyItem = {
          id: `reply-${Date.now()}`,
          message: replyText.trim(),
          sender_name: "You (Subscriber)",
          is_staff: false,
          created_at: new Date().toISOString(),
        };
        setTicketData((prev) =>
          prev ? { ...prev, replies: [...(prev.replies || []), newReply] } : prev
        );
      }

      setReplyText("");
      onTicketUpdated?.();
    } catch (err: any) {
      setError(err.message || "Failed to submit reply");
    } finally {
      setSubmitting(false);
    }
  };

  if (!ticketData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl bg-card border-border p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-border/60 bg-muted/20 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs text-indigo-400">
                {ticketData.ticket_no}
              </span>
              <Badge
                className={`text-[10px] px-2 py-0 ${
                  ticketData.status === "Closed" || ticketData.status === "Resolved"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                }`}
              >
                {ticketData.status}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-2 py-0 border-border">
                {ticketData.priority} Priority
              </Badge>
            </div>
            <DialogTitle className="text-sm font-bold text-foreground">
              {ticketData.subject}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Category: <strong className="text-foreground">{ticketData.category}</strong>
            </DialogDescription>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Conversation Thread */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Original Complaint Card */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" /> Initial Complaint
              </span>
              <span className="text-muted-foreground font-mono">
                {ticketData.created_at ? new Date(ticketData.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Reported"}
              </span>
            </div>
            <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
              {ticketData.description}
            </p>
          </div>

          {/* Reply Messages */}
          {ticketData.replies && ticketData.replies.length > 0 ? (
            ticketData.replies.map((r) => (
              <div
                key={r.id}
                className={`flex flex-col ${r.is_staff ? "items-start" : "items-end"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 space-y-1 ${
                    r.is_staff
                      ? "bg-indigo-950/40 border border-indigo-500/30 text-indigo-100 rounded-tl-sm"
                      : "bg-indigo-600 text-white rounded-tr-sm shadow-md"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[10px] opacity-80 mb-1">
                    <span className="font-bold flex items-center gap-1">
                      {r.is_staff ? (
                        <>
                          <Headphones className="h-3 w-3 text-indigo-400" />
                          {r.sender_name || "Support Engineer"} (ISP Technical Team)
                        </>
                      ) : (
                        <>
                          <User className="h-3 w-3" />
                          You (Subscriber)
                        </>
                      )}
                    </span>
                    <span className="font-mono">
                      {r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  <p className="text-xs whitespace-pre-line leading-relaxed">{r.message}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="py-4 text-center text-muted-foreground text-[11px]">
              No replies yet. Our technical support team has been assigned to your ticket.
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Reply Form */}
        {ticketData.status !== "Closed" && (
          <form
            onSubmit={handleSendReply}
            className="p-3 border-t border-border/60 bg-muted/20 flex flex-col gap-2"
          >
            {error && <p className="text-[11px] text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <textarea
                rows={2}
                required
                placeholder="Type your reply or additional details here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
              />
              <Button
                type="submit"
                disabled={submitting || !replyText.trim()}
                className="self-end bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 px-4 gap-1.5 shadow-sm"
              >
                <Send className="h-3.5 w-3.5" />
                {submitting ? "Sending..." : "Reply"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
