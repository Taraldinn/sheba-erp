"use client";

import { useEffect, useState } from "react";
import {
  Headphones,
  Plus,
  MessageSquare,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { Ticket } from "@/types";

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [threadModalOpen, setThreadModalOpen] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    const t = await ApiClient.getTickets();
    setTickets(t);
  }

  const handleOpenThread = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setThreadModalOpen(true);
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    const newReply = {
      id: `r_${Date.now()}`,
      sender_name: "System Admin (You)",
      is_staff: true,
      message: replyMessage,
      created_at: "Just now",
    };

    const updated = {
      ...selectedTicket,
      replies: [...(selectedTicket.replies || []), newReply],
    };

    setSelectedTicket(updated);
    setTickets(tickets.map((t) => (t.id === updated.id ? updated : t)));
    setReplyMessage("");
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Support Desk & NOC Incident Tickets</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track optical loss incidents, speed complaints, fiber cuts, and subscriber service requests.
          </p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
          <Plus className="h-4 w-4" />
          Create Incident Ticket
        </Button>
      </div>

      {/* Tickets List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Active Support Incidents</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Click on any ticket to view technical diagnostics and send staff replies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-800/80">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => handleOpenThread(ticket)}
                className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-card/60 p-3 rounded-xl cursor-pointer transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-400">{ticket.ticket_no}</span>
                    <Badge
                      variant={
                        ticket.priority === "Critical"
                          ? "destructive"
                          : ticket.priority === "High"
                          ? "warning"
                          : "default"
                      }
                      className="text-[10px]"
                    >
                      {ticket.priority} Priority
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">({ticket.category})</span>
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">{ticket.subject}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-1">{ticket.description}</p>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <div className="text-right">
                    <p className="font-medium text-foreground">{ticket.customer_name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{ticket.customer_phone}</p>
                  </div>
                  <Badge variant={ticket.status === "Resolved" ? "success" : "secondary"}>
                    {ticket.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ticket Thread Dialog */}
      <Dialog open={threadModalOpen} onOpenChange={setThreadModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <span className="font-mono text-xs font-bold text-indigo-400">{selectedTicket?.ticket_no}</span>
              <Badge variant="warning">{selectedTicket?.priority} Priority</Badge>
            </div>
            <DialogTitle className="text-base text-foreground mt-1">{selectedTicket?.subject}</DialogTitle>
            <DialogDescription className="text-xs">
              Subscriber: {selectedTicket?.customer_name} ({selectedTicket?.customer_phone})
            </DialogDescription>
          </DialogHeader>

          {/* Original issue description */}
          <div className="p-3 rounded-lg bg-background border border-border text-xs text-muted-foreground">
            <span className="font-bold text-muted-foreground block mb-1">Issue Description:</span>
            {selectedTicket?.description}
          </div>

          {/* Conversation Thread */}
          <div className="flex-1 overflow-y-auto space-y-3 py-2 max-h-[250px]">
            {selectedTicket?.replies?.map((rep) => (
              <div
                key={rep.id}
                className={`p-3 rounded-xl text-xs space-y-1 ${
                  rep.is_staff
                    ? "bg-indigo-500/10 border border-indigo-500/30 ml-6 text-foreground/80"
                    : "bg-card border border-border mr-6 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-400">
                  <span>{rep.sender_name}</span>
                  <span className="text-muted-foreground">{rep.created_at}</span>
                </div>
                <p>{rep.message}</p>
              </div>
            ))}
          </div>

          {/* Reply Form */}
          <form onSubmit={handleSendReply} className="flex gap-2 pt-2 border-t border-border">
            <Input
              placeholder="Type staff reply or dispatch instructions..."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              className="text-xs"
            />
            <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
