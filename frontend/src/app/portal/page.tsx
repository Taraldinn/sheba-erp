"use client";

import { useState } from "react";
import {
  Wifi,
  CreditCard,
  Zap,
  CheckCircle2,
  Calendar,
  Download,
  Headphones,
  Shield,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

export default function SubscriberPortalPage() {
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("bKash");
  const [paySuccess, setPaySuccess] = useState(false);

  const handlePayBill = (e: React.FormEvent) => {
    e.preventDefault();
    setPaySuccess(true);
    setTimeout(() => {
      setPaySuccess(false);
      setPayModalOpen(false);
    }, 1800);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-tr from-indigo-900/60 via-slate-900 to-slate-900 p-6 rounded-2xl border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              SUBSCRIBER SELF-CARE
            </span>
            <Badge variant="success">Active Fiber Line</Badge>
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Welcome, Tanvir Ahmed</h1>
          <p className="text-xs text-muted-foreground">
            Account Code: <span className="text-indigo-400 font-mono font-semibold">SB-1001</span> • PPPoE: <span className="text-foreground/80 font-mono font-semibold">tanvir_home</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button
            size="lg"
            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-foreground font-bold gap-2 shadow-lg shadow-indigo-600/30"
            onClick={() => setPayModalOpen(true)}
          >
            <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
            Pay Bill / Recharge ৳800
          </Button>
        </div>
      </div>

      {/* Grid for Speed & Subscription status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Speed Card */}
        <Card className="border-indigo-500/20 bg-indigo-500/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold text-indigo-400">Active Package</CardDescription>
            <CardTitle className="text-xl font-bold text-foreground">Turbo Stream</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-foreground font-mono">30</span>
              <span className="text-sm font-semibold text-indigo-400">Mbps Symmetrical</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border text-[11px] text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>BDIX Bandwidth:</span>
                <span className="text-emerald-400 font-bold">100 Mbps</span>
              </div>
              <div className="flex justify-between">
                <span>YouTube / Netflix:</span>
                <span className="text-indigo-400 font-bold">4K Ultra HD</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expiry Countdown */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold text-muted-foreground">Validity & Expiry</CardDescription>
            <CardTitle className="text-xl font-bold text-foreground">18 Days Remaining</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground font-medium">
              Expires on <span className="text-emerald-400 font-bold font-mono">24 September 2026</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-500 h-full w-[60%]"></div>
            </div>
            <p className="text-[11px] text-muted-foreground">Auto-lock protection active on due date.</p>
          </CardContent>
        </Card>

        {/* Bill Summary */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold text-muted-foreground">Billing Summary</CardDescription>
            <CardTitle className="text-xl font-bold text-foreground">{formatCurrency(800)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Monthly Rate:</span>
              <span className="font-semibold text-foreground">৳800.00</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Previous Due:</span>
              <span className="text-emerald-400 font-semibold">৳0.00</span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between text-xs font-bold text-foreground">
              <span>Next Due Date:</span>
              <span className="text-indigo-400 font-mono">01 Oct 2026</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Gateway Modal */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-indigo-400" />
              Online Bill Payment & Recharge
            </DialogTitle>
            <DialogDescription>
              Select your payment method for instant connection renewal.
            </DialogDescription>
          </DialogHeader>

          {paySuccess ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 animate-bounce" />
              <h4 className="font-bold text-foreground text-base">Payment Verified & Recharged!</h4>
              <p className="text-xs text-muted-foreground">Your line is extended by 30 days. TrxID: BKSH99214</p>
            </div>
          ) : (
            <form onSubmit={handlePayBill} className="space-y-4 pt-2">
              <div className="p-3 rounded-xl bg-background border border-border flex justify-between items-center">
                <div>
                  <p className="text-xs text-muted-foreground">Total Payable Amount</p>
                  <p className="text-xl font-bold text-foreground">৳800.00</p>
                </div>
                <Badge variant="default">Turbo Stream 30M</Badge>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Select Mobile Banking Gateway</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "bKash", name: "bKash Checkout", color: "border-pink-500/50 bg-pink-950/20" },
                    { id: "Nagad", name: "Nagad Merchant", color: "border-orange-500/50 bg-orange-950/20" },
                  ].map((gw) => (
                    <button
                      key={gw.id}
                      type="button"
                      onClick={() => setSelectedMethod(gw.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedMethod === gw.id
                          ? `${gw.color} ring-2 ring-indigo-500`
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <p className="font-bold text-sm text-foreground">{gw.id}</p>
                      <p className="text-[10px] text-muted-foreground">{gw.name}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Transaction ID (TrxID)</label>
                <Input
                  required
                  placeholder="e.g. 9X7K2M91PQ"
                  defaultValue="9X7K2M91PQ"
                  className="font-mono text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                  Verify & Extend Line
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
