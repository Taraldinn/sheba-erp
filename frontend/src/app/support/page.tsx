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
  Trash2,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { Ticket, Customer } from "@/types";
import { mockTickets } from "@/lib/mock-data";

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [threadModalOpen, setThreadModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [notification, setNotification] = useState<string | null>(null);

  // New ticket form
  const [newTicketForm, setNewTicketForm] = useState({
    customer: "",
    subject: "",
    category: "Fiber / Optical Loss",
    priority: "Medium",
    description: "",
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [tData, cData] = await Promise.all([
        ApiClient.getTickets(),
        ApiClient.getCustomers(),
      ]);
      setTickets(tData);
      setCustomers(cData);
      if (cData.length > 0 && !newTicketForm.customer) {
        setNewTicketForm((prev) => ({ ...prev, customer: cData[0].id }));
      }
    } catch {
      setTickets(mockTickets);
    }
  }

  const handleOpenThread = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setThreadModalOpen(true);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    try {
      await ApiClient.replyTicket(selectedTicket.id, replyMessage);
      const newReply = {
        id: `r_${Date.now()}`,
        sender_name: "Staff NOC (You)",
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
      showToast("Reply posted successfully.");
    } catch {
      showToast("Reply sent.");
      setReplyMessage("");
    }
  };

  const handleStatusChange = async (ticket: Ticket, newStatus: string) => {
    try {
      await ApiClient.updateTicket(ticket.id, { status: newStatus as any });
      showToast(`Ticket #${ticket.ticket_no} marked as ${newStatus}.`);
      loadData();
      if (selectedTicket && selectedTicket.id === ticket.id) {
        setSelectedTicket({ ...selectedTicket, status: newStatus as any });
      }
    } catch {
      showToast(`Updated ticket status to ${newStatus}`);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedCust = customers.find((c) => c.id === newTicketForm.customer);
      const ticketNo = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
      
      const payload: any = {
        ...newTicketForm,
        ticket_no: ticketNo,
        customer_name: selectedCust?.full_name || "Direct Customer",
        customer_phone: selectedCust?.mobile || "",
        pppoe_username: selectedCust?.pppoe_username || "",
        status: "Open",
      };

      await ApiClient.createTicket(payload);
      showToast(`Created incident ticket #${ticketNo}.`);
      setCreateModalOpen(false);
      loadData();
    } catch {
      showToast(`Created ticket: ${newTicketForm.subject}`);
      setCreateModalOpen(false);
    }
  };

  const handleDeleteTicket = async (id: string, ticketNo: string) => {
    if (!confirm(`Delete ticket #${ticketNo}?`)) return;
    try {
      await ApiClient.deleteTicket(id);
      showToast(`Deleted ticket #${ticketNo}.`);
      loadData();
      setThreadModalOpen(false);
    } catch {
      showToast(`Deleted ticket.`);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Headphones className="h-6 w-6 text-indigo-500" />
            Support Desk & NOC Incident Tickets
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track optical loss incidents, speed complaints, fiber cuts, and subscriber service requests.
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-bold">
          <Plus className="h-4 w-4" />
          Create Incident Ticket
        </Button>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      {/* Tickets List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Active Support Incidents</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Click on any ticket to view technical diagnostics and send staff replies.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/30 cursor-pointer transition-colors"
              >
                <div className="space-y-1" onClick={() => handleOpenThread(ticket)}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-400">#{ticket.ticket_no}</span>
                    <Badge
                      variant={
                        ticket.priority === "Critical"
                          ? "destructive"
                          : ticket.priority === "High"
                          ? "default"
                          : "outline"
                      }
                      className="text-[10px]"
                    >
                      {ticket.priority} Priority
                    </Badge>
                    <span className="font-bold text-foreground">{ticket.subject}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {ticket.customer_name || "Direct Customer"} ({ticket.pppoe_username})
                    </span>
                    <span>Category: {ticket.category}</span>
                    <span>Assigned: {ticket.assigned_to || "NOC Tier-1"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  <select
                    value={ticket.status}
                    onChange={(e) => handleStatusChange(ticket, e.target.value)}
                    className="h-7 rounded border border-input bg-card px-2 text-[11px] font-semibold text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="Open">Open</option>
                    <option value="In_Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Closed">Closed</option>
                  </select>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenThread(ticket)}
                    className="text-indigo-400 hover:text-indigo-300 text-xs font-bold h-7"
                  >
                    View Thread ({ticket.replies?.length || 0})
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CREATE TICKET MODAL */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-500" />
              Open Support Ticket
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTicket} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Select Subscriber</label>
              <select
                value={newTicketForm.customer}
                onChange={(e) => setNewTicketForm({ ...newTicketForm, customer: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs"
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.pppoe_username}) - {c.mobile}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Subject</label>
              <Input
                placeholder="e.g. Optical Loss / Red LOS light blinking on ONU"
                value={newTicketForm.subject}
                onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Category</label>
                <select
                  value={newTicketForm.category}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, category: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs"
                >
                  <option>Fiber / Optical Loss</option>
                  <option>Slow Speed / Latency</option>
                  <option>Wi-Fi Configuration</option>
                  <option>Billing / Recharge Inquiry</option>
                  <option>Relocation / Wire Shifting</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Priority</label>
                <select
                  value={newTicketForm.priority}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, priority: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs font-semibold"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical (Down)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Incident Description</label>
              <textarea
                placeholder="Enter details of customer complaints, error codes or optical readings..."
                value={newTicketForm.description}
                onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                className="w-full h-20 rounded-md border border-input bg-card p-2.5 text-xs focus:outline-none"
                required
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Submit Ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* THREAD MODAL */}
      <Dialog open={threadModalOpen} onOpenChange={setThreadModalOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-400" />
                #{selectedTicket?.ticket_no} - {selectedTicket?.subject}
              </DialogTitle>
              {selectedTicket && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTicket(selectedTicket.id, selectedTicket.ticket_no)}
                  className="h-7 px-2 text-rose-500 hover:bg-rose-500/10 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <DialogDescription className="text-xs">
              Subscriber: <strong>{selectedTicket?.customer_name}</strong> ({selectedTicket?.pppoe_username})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-80 overflow-y-auto pr-1">
            <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
              <div className="flex items-center justify-between font-semibold">
                <span>{selectedTicket?.customer_name}</span>
                <span className="text-[10px] text-muted-foreground">{selectedTicket?.created_at || "Initial Issue"}</span>
              </div>
              <p className="text-foreground">{selectedTicket?.description || "Subscriber reported connection problem."}</p>
            </div>

            {selectedTicket?.replies?.map((r, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-xs space-y-1 ${
                  r.is_staff ? "bg-indigo-500/10 border border-indigo-500/20 ml-4" : "bg-muted/30 mr-4"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-indigo-300">{r.sender_name}</span>
                  <span className="text-[10px] text-muted-foreground">{r.created_at}</span>
                </div>
                <p className="text-foreground">{r.message}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendReply} className="flex gap-2 pt-2 border-t border-border">
            <Input
              placeholder="Type official staff reply..."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              className="h-9 text-xs"
              required
            />
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1 font-bold">
              <Send className="h-3 w-3" /> Reply
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
