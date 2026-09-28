"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle, Zap, ShieldCheck, HelpCircle, ArrowRight, CreditCard } from "lucide-react";
import { PortalApiClient } from "@/lib/portal-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SmsPaymentVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  customerCode?: string;
  pppoeUsername?: string;
}

export function SmsPaymentVerificationModal({
  isOpen,
  onClose,
  onSuccess,
  customerCode,
  pppoeUsername,
}: SmsPaymentVerificationModalProps) {
  const [gateway, setGateway] = useState<"bKash" | "Nagad" | "Rocket" | "Upay">("bKash");
  const [trxId, setTrxId] = useState("");
  const [amount, setAmount] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trxId.trim()) {
      setError("Please enter the Transaction ID (TrxID) from your SMS");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await PortalApiClient.claimManualMfsPayment(trxId.trim());
      setSuccessData(res);
      onSuccess(res.message || "Payment verified and internet line activated!");
    } catch (err: any) {
      setError(
        err.message ||
          "Could not verify transaction with this TrxID. Please check the digits and try again or contact support."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTrxId("");
    setAmount("");
    setSenderPhone("");
    setError(null);
    setSuccessData(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleReset()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
            SMS & MFS Payment Verification
          </DialogTitle>
          <DialogDescription className="text-xs">
            Paid your bill via personal bKash, Nagad, or Rocket? Enter the SMS TrxID to claim and auto-restore your internet connection.
          </DialogDescription>
        </DialogHeader>

        {successData ? (
          <div className="py-6 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-4 ring-emerald-500/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">Transaction Verified & Activated!</h3>
              <p className="text-xs text-muted-foreground">{successData.message}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-left space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">TrxID:</span>
                <span className="font-bold text-foreground">{trxId.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Ref:</span>
                <span className="text-indigo-400 font-bold">{customerCode || pppoeUsername || "SB-1001"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line Status:</span>
                <span className="text-emerald-400 font-bold">Active & Online</span>
              </div>
            </div>

            <Button
              onClick={handleReset}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9"
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Gateway Picker */}
            <div>
              <label className="block font-semibold mb-1.5 text-foreground">Select Payment Method / App</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "bKash", color: "text-pink-400", border: "border-pink-500/40" },
                  { id: "Nagad", color: "text-amber-400", border: "border-amber-500/40" },
                  { id: "Rocket", color: "text-purple-400", border: "border-purple-500/40" },
                  { id: "Upay", color: "text-blue-400", border: "border-blue-500/40" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setGateway(item.id as any)}
                    className={`p-2 rounded-lg border text-center font-bold text-xs transition-all ${
                      gateway === item.id
                        ? `bg-indigo-500/20 text-indigo-300 border-indigo-500 ring-1 ring-indigo-500/50`
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.id}
                  </button>
                ))}
              </div>
            </div>

            {/* TrxID Input */}
            <div>
              <label className="block font-semibold mb-1 text-foreground">
                Transaction ID (TrxID) <span className="text-rose-400">*</span>
              </label>
              <Input
                required
                placeholder="e.g. 9J182KSL9A"
                value={trxId}
                onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                className="bg-background h-9 text-xs font-mono uppercase tracking-wider"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Found in the confirmation SMS received from {gateway} (usually 8-12 characters).
              </p>
            </div>

            {/* Optional Amount & Sender Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1 text-foreground">Amount Paid (BDT)</label>
                <Input
                  type="number"
                  placeholder="e.g. 800"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-background h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-foreground">Sender Mobile (Optional)</label>
                <Input
                  placeholder="01XXXXXXXXX"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  className="bg-background h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-300 fill-amber-300" />
                Automatic Instant Reactivation:
              </p>
              <p>
                Our system will cross-reference the SMS TrxID against the company MFS merchant receiver log. If confirmed, your internet connection will be activated immediately.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button type="button" variant="ghost" onClick={handleReset} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 gap-1.5"
              >
                {loading ? "Verifying..." : "Verify & Restore Internet"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
