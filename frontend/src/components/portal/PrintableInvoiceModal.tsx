"use client";

import React, { useState, useEffect } from "react";
import { Printer, Download, X, CheckCircle2, AlertCircle, FileText, Building2, Phone, Mail, MapPin } from "lucide-react";
import { PortalApiClient } from "@/lib/portal-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PrintableInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
  fallbackInvoice?: any;
  customerProfile?: any;
}

export function PrintableInvoiceModal({
  isOpen,
  onClose,
  invoiceId,
  fallbackInvoice,
  customerProfile,
}: PrintableInvoiceModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !invoiceId) {
      setData(null);
      setError(null);
      return;
    }

    const loadReceipt = async () => {
      setLoading(true);
      setError(null);
      try {
        if (PortalApiClient.isAuthenticated()) {
          const res = await PortalApiClient.getInvoiceReceipt(invoiceId);
          setData(res);
        } else {
          // Demo fallback
          setData({
            invoice: {
              id: invoiceId,
              invoice_no: fallbackInvoice?.invoice_no || `INV-${invoiceId.slice(0, 8).toUpperCase()}`,
              billing_month: fallbackInvoice?.billing_month || "September 2026",
              total_payable: fallbackInvoice?.total_payable || 800,
              paid_amount: fallbackInvoice?.paid_amount || 800,
              status: fallbackInvoice?.status || "PAID",
              created_at: fallbackInvoice?.created_at || new Date().toISOString(),
              paid_at: fallbackInvoice?.paid_at || new Date().toISOString(),
              package_name: fallbackInvoice?.package_name || "Turbo Stream 30M",
              package_speed: fallbackInvoice?.package_speed || 30,
              payment_method: "bKash Online",
              trx_id: "BKSH91827419A",
            },
            company: {
              name: "ShebaFi Broadband Network Ltd.",
              phone: "+880 1800-000000",
              email: "support@shebafi.net",
              address: "House 12, Road 4, Sector 7, Uttara, Dhaka-1230",
              logo: null,
            },
            customer: {
              code: customerProfile?.customer_code || "SB-1001",
              name: customerProfile?.full_name || "Tanvir Ahmed",
              pppoe_username: customerProfile?.pppoe_username || "tanvir_home",
              mobile: customerProfile?.mobile || "01700000000",
              address: customerProfile?.address || "Uttara, Sector 7, Dhaka",
            },
          });
        }
      } catch (err: any) {
        setError(err.message || "Failed to load receipt details");
      } finally {
        setLoading(false);
      }
    };

    loadReceipt();
  }, [isOpen, invoiceId, fallbackInvoice, customerProfile]);

  const handlePrint = () => {
    window.print();
  };

  const invoice = data?.invoice || fallbackInvoice;
  const company = data?.company || {
    name: "ShebaFi Broadband Network",
    phone: "+880 1800-000000",
    email: "support@shebafi.net",
    address: "Dhaka, Bangladesh",
  };
  const customer = data?.customer || {
    code: customerProfile?.customer_code || "SB-1001",
    name: customerProfile?.full_name || "Subscriber",
    pppoe_username: customerProfile?.pppoe_username || "subscriber",
    mobile: customerProfile?.mobile || "—",
    address: customerProfile?.address || "—",
  };

  const isPaid = invoice?.status === "PAID";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border p-0 overflow-hidden print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none">
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between p-4 border-b border-border/60 bg-muted/30 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-400" />
            <DialogTitle className="text-sm font-bold text-foreground">
              Official Billing Invoice Receipt
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8 gap-1.5 shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" /> Print / Save PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-xs">
            Loading official receipt...
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-rose-400 mx-auto" />
            <p className="text-xs text-rose-400 font-semibold">{error}</p>
            <Button size="sm" variant="outline" onClick={onClose} className="text-xs">
              Close
            </Button>
          </div>
        ) : (
          <div
            id="printable-receipt-area"
            className="p-6 sm:p-8 space-y-6 text-foreground bg-background print:bg-white print:text-black print:p-6"
          >
            {/* Header: Company and Invoice Info */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/80 pb-6 print:border-black/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-sm">
                    S
                  </div>
                  <h2 className="text-xl font-black text-foreground print:text-black tracking-tight">
                    {company.name}
                  </h2>
                </div>
                <div className="text-xs text-muted-foreground print:text-gray-600 space-y-0.5 pt-1">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0" /> {company.address}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0" /> {company.phone} • <Mail className="h-3 w-3 shrink-0" /> {company.email}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right space-y-1">
                <Badge
                  className={`text-xs px-2.5 py-0.5 font-bold ${
                    isPaid
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 print:border print:text-emerald-700"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/30 print:border print:text-rose-700"
                  }`}
                >
                  {isPaid ? "PAID & VERIFIED" : "UNPAID / DUE"}
                </Badge>
                <p className="text-sm font-black font-mono text-foreground print:text-black mt-1">
                  {invoice?.invoice_no}
                </p>
                <p className="text-[11px] text-muted-foreground print:text-gray-600">
                  Billing Month: <strong className="text-foreground print:text-black">{invoice?.billing_month}</strong>
                </p>
                <p className="text-[11px] text-muted-foreground print:text-gray-600">
                  Date: {formatDate(invoice?.created_at)}
                </p>
              </div>
            </div>

            {/* Customer Details Block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/20 border border-border/60 print:bg-gray-50 print:border-gray-200 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-500">
                  Billed To (Subscriber)
                </span>
                <p className="font-bold text-sm text-foreground print:text-black">{customer.name}</p>
                <p className="text-muted-foreground print:text-gray-600">
                  Customer ID: <strong className="font-mono text-foreground print:text-black">{customer.code}</strong>
                </p>
                <p className="text-muted-foreground print:text-gray-600">
                  PPPoE Login ID: <strong className="font-mono text-foreground print:text-black">{customer.pppoe_username}</strong>
                </p>
              </div>

              <div className="space-y-1 sm:text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-500">
                  Connection & Contact
                </span>
                <p className="text-muted-foreground print:text-gray-600">Phone: {customer.mobile}</p>
                <p className="text-muted-foreground print:text-gray-600">Address: {customer.address}</p>
                {invoice?.trx_id && (
                  <p className="text-[11px] text-indigo-400 print:text-indigo-700 font-mono font-bold">
                    TrxID: {invoice.trx_id}
                  </p>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b-2 border-border/80 text-muted-foreground print:border-black print:text-black font-bold">
                  <tr>
                    <th className="py-2.5 px-2">Description</th>
                    <th className="py-2.5 px-2">Speed Tier</th>
                    <th className="py-2.5 px-2">Period</th>
                    <th className="py-2.5 px-2 text-right">Amount (BDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 print:divide-gray-200">
                  <tr>
                    <td className="py-3 px-2 font-semibold text-foreground print:text-black">
                      Broadband Monthly Internet Subscription - {invoice?.package_name || "Fiber Standard"}
                    </td>
                    <td className="py-3 px-2 font-mono text-indigo-400 print:text-gray-700">
                      {invoice?.package_speed || 30} Mbps
                    </td>
                    <td className="py-3 px-2 text-muted-foreground print:text-gray-600">
                      {invoice?.billing_month}
                    </td>
                    <td className="py-3 px-2 text-right font-mono font-bold text-foreground print:text-black">
                      {formatCurrency(invoice?.total_payable)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Summary Totals */}
            <div className="flex justify-end pt-2 border-t border-border/60 print:border-black/20">
              <div className="w-64 space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground print:text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">{formatCurrency(invoice?.total_payable)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground print:text-gray-600">
                  <span>Discount / Rebate:</span>
                  <span className="font-mono">৳0.00</span>
                </div>
                <div className="flex justify-between text-muted-foreground print:text-gray-600">
                  <span>VAT / AIT (Included):</span>
                  <span className="font-mono">৳0.00</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-foreground print:text-black border-t border-border/60 pt-1.5 print:border-black/20">
                  <span>Total Payable:</span>
                  <span className="font-mono text-indigo-400 print:text-black">
                    {formatCurrency(invoice?.total_payable)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-xs text-emerald-400 print:text-emerald-700">
                  <span>Paid Amount:</span>
                  <span className="font-mono">{formatCurrency(invoice?.paid_amount || (isPaid ? invoice?.total_payable : 0))}</span>
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="pt-6 border-t border-border/40 text-[11px] text-muted-foreground print:text-gray-500 text-center space-y-1">
              <p>This is a computer-generated official billing receipt issued by {company.name}.</p>
              <p>For billing queries, call our 24/7 hotline at {company.phone} or email {company.email}.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
