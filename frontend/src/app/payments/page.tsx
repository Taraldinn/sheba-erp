"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Zap,
  ArrowDownLeft,
  ShieldCheck,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { PaymentTransaction, SmsLog } from "@/types";

export default function PaymentsPage() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [testSms, setTestSms] = useState("You have received Tk 800.00 from 01711223344. Fee Tk 0.00. Balance Tk 52000.00. TrxID 9K9P2M4X7Q");
  const [testSender, setTestSender] = useState("bKash");
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [t, s] = await Promise.all([ApiClient.getTransactions(), ApiClient.getSmsLogs()]);
    setTransactions(t);
    setSmsLogs(s);
  }

  const handleTestSmsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newLog: SmsLog = {
      id: `sms_${Date.now()}`,
      sender: testSender,
      raw_message: testSms,
      parsed_provider: testSender,
      parsed_amount: 800,
      parsed_trx_id: "9K9P2M4X7Q",
      parsed_account: "01711223344",
      is_matched: true,
      matched_customer_name: "Tanvir Ahmed (tanvir_home)",
      created_at: "Just now",
    };

    setSmsLogs([newLog, ...smsLogs]);
    setTestSuccess(true);
    setTimeout(() => setTestSuccess(false), 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Payments & Automated SMS Ingestion</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Automated mobile banking webhook ingestion (bKash, Nagad, Rocket), SMS parsing, and instant auto-reconciliation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="border-border bg-card text-xs gap-1.5" onClick={loadData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Webhook Feed
          </Button>
        </div>
      </div>

      {/* Payment Gateways Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-foreground">bKash Merchant API</span>
              <Badge variant="success" className="text-[10px]">Live Webhook</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Merchant: 01700000000</p>
            <p className="text-[11px] text-emerald-400 mt-2 font-medium">99.8% Auto-Match Rate</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-foreground">Nagad Direct Gateway</span>
              <Badge variant="success" className="text-[10px]">Connected</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Merchant: 01977665544</p>
            <p className="text-[11px] text-emerald-400 mt-2 font-medium">Instant Callback OK</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-foreground">SSLCommerz Multi-Card</span>
              <Badge variant="secondary" className="text-[10px]">Active</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Visa / Master / Amex / Nexus</p>
            <p className="text-[11px] text-muted-foreground mt-2">Card Checkout Enabled</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-foreground">Android SMS Forwarder</span>
              <Badge variant="success" className="text-[10px]">Listening</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">SIM Slot 1 & 2 Active</p>
            <p className="text-[11px] text-indigo-400 mt-2 font-medium">Auto Regex Engine Running</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Transactions and SMS Ingestion Engine */}
      <Tabs defaultValue="sms" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="sms">SMS Parser & Matching Queue</TabsTrigger>
          <TabsTrigger value="ledger">All Settled Transactions</TabsTrigger>
        </TabsList>

        {/* SMS Webhook Queue */}
        <TabsContent value="sms" className="mt-4 space-y-6">
          {/* Test Workbench */}
          <Card className="border-indigo-500/20 bg-indigo-500/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-indigo-400" />
                Live SMS Webhook Ingestion Test Bench
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Simulate receiving an automated payment notification SMS from an Android SMS Gateway or GSM Modem.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTestSmsSubmit} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium">Sender ID / Phone</label>
                    <Input
                      value={testSender}
                      onChange={(e) => setTestSender(e.target.value)}
                      placeholder="e.g. bKash or 16167"
                      className="mt-1"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-[11px] text-muted-foreground font-medium">Raw SMS Payload Text</label>
                    <Input
                      value={testSms}
                      onChange={(e) => setTestSms(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    Auto extracts: <strong>Amount (৳)</strong>, <strong>TrxID</strong>, <strong>Customer Phone</strong>, and extends PPPoE expiry date.
                  </span>
                  <Button size="sm" type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
                    <Send className="h-3.5 w-3.5" />
                    Simulate Ingestion
                  </Button>
                </div>
                {testSuccess && (
                  <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    SMS successfully ingested! Customer &apos;tanvir_home&apos; matched and credited ৳800.
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Ingested SMS Logs Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Live Ingested SMS Stream</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Latest SMS webhooks parsed by regex engine.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="pb-2 font-medium">Sender</th>
                      <th className="pb-2 font-medium">Raw Message Text</th>
                      <th className="pb-2 font-medium">Extracted TrxID</th>
                      <th className="pb-2 font-medium">Parsed Amount</th>
                      <th className="pb-2 font-medium">Matching Result</th>
                      <th className="pb-2 font-medium">Received At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {smsLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/50">
                        <td className="py-3 font-semibold text-foreground">{log.sender}</td>
                        <td className="py-3 font-mono text-[11px] text-muted-foreground max-w-md truncate">
                          {log.raw_message}
                        </td>
                        <td className="py-3 font-mono font-medium text-indigo-400">{log.parsed_trx_id || "N/A"}</td>
                        <td className="py-3 font-bold text-emerald-400">{formatCurrency(log.parsed_amount || 0)}</td>
                        <td className="py-3">
                          {log.is_matched ? (
                            <Badge variant="success" className="text-[10px]">
                              Matched: {log.matched_customer_name}
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px]">
                              Unmatched (Pending Manual Review)
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">{log.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settled Transactions Ledger */}
        <TabsContent value="ledger" className="mt-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Settled Payments Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="pb-2 font-medium">Subscriber Name</th>
                      <th className="pb-2 font-medium">TrxID</th>
                      <th className="pb-2 font-medium">Method</th>
                      <th className="pb-2 font-medium">Phone / Account</th>
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/50">
                        <td className="py-3 font-semibold text-foreground">
                          {t.customer_name}
                          <span className="block text-[10px] text-muted-foreground font-mono">{t.customer_username}</span>
                        </td>
                        <td className="py-3 font-mono text-indigo-400">{t.trx_id}</td>
                        <td className="py-3">{t.payment_method}</td>
                        <td className="py-3 font-mono text-muted-foreground">{t.customer_account}</td>
                        <td className="py-3 font-bold text-emerald-400">{formatCurrency(t.amount)}</td>
                        <td className="py-3"><Badge variant="success">{t.status}</Badge></td>
                        <td className="py-3 text-muted-foreground">{t.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
