'use client';

import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { SaaSPayment, SaaSTenant } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSPaymentsLedgerProps {
  payments: SaaSPayment[];
  tenants: SaaSTenant[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreatePayment: (payload: Partial<SaaSPayment>) => Promise<void>;
  onDeletePayment: (id: string) => Promise<void>;
}

export function SaaSPaymentsLedger({
  payments,
  tenants,
  isLoading,
  onRefresh,
  onCreatePayment,
  onDeletePayment,
}: SaaSPaymentsLedgerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(tenants[0]?.id || '');
  const [amount, setAmount] = useState<number>(15000);
  const [paymentMethod, setPaymentMethod] = useState('bKash');
  const [trxId, setTrxId] = useState('');
  const [status, setStatus] = useState('Completed');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tenants.length > 0 && (!selectedTenant || !tenants.some((t) => t.id === selectedTenant))) {
      setSelectedTenant(tenants[0]?.id || '');
    } else if (tenants.length === 0 && selectedTenant) {
      setSelectedTenant('');
    }
  }, [tenants, selectedTenant]);

  const [paymentToDelete, setPaymentToDelete] = useState<SaaSPayment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredPayments = payments.filter((p) => {
    return (
      p.trx_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.tenant_name && p.tenant_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.payment_method.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedTenant || !tenants.some((t) => t.id === selectedTenant)) {
      setErrorMsg('Please select a valid tenant.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreatePayment({
        tenant: selectedTenant,
        amount: Number(amount),
        payment_method: paymentMethod,
        trx_id: trxId.trim() || `TRX-${Date.now()}`,
        status: status as SaaSPayment['status'],
        notes,
      });
      setIsModalOpen(false);
      setTrxId('');
      setNotes('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!paymentToDelete) return;
    setIsDeleting(true);
    try {
      await onDeletePayment(paymentToDelete.id);
      setPaymentToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search transaction ID, tenant, or method..."
            className="pl-9 text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="text-xs h-9 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading && payments.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Payment Records Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Transactions recorded here represent software licensing fees collected from ISP tenants.
          </p>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="text-xs bg-violet-600 text-white mt-2"
          >
            Record First Transaction
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-3.5 font-semibold">Transaction ID</th>
                <th className="p-3.5 font-semibold">Tenant Organization</th>
                <th className="p-3.5 font-semibold">Payment Method</th>
                <th className="p-3.5 font-semibold">Amount Paid</th>
                <th className="p-3.5 font-semibold">Timestamp</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-foreground">
                    {payment.trx_id}
                  </td>
                  <td className="p-3.5">
                    <span className="font-semibold text-foreground">
                      {payment.tenant_name || payment.tenant}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <Badge variant="outline" className="text-[10px]">
                      {payment.payment_method}
                    </Badge>
                  </td>
                  <td className="p-3.5 font-bold text-emerald-500">
                    {formatCurrency(Number(payment.amount) || 0)}
                  </td>
                  <td className="p-3.5 text-muted-foreground">
                    {new Date(payment.paid_at || payment.created_at).toLocaleString()}
                  </td>
                  <td className="p-3.5">
                    <Badge
                      variant="outline"
                      className={
                        payment.status === 'Completed'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]'
                          : payment.status === 'Pending'
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/30 text-[10px]'
                      }
                    >
                      {payment.status}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPaymentToDelete(payment)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete Transaction"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-base font-bold text-foreground mb-1">Record Software Payment</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter manual MFS, bank wire, or online subscription payment from an ISP tenant.
            </p>

            {errorMsg && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs mb-4 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Select ISP Tenant *</label>
                <select
                  required
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Amount (BDT) *</label>
                  <Input
                    required
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="text-xs h-9 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Payment Channel</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                  >
                    <option value="bKash">bKash Merchant</option>
                    <option value="Nagad">Nagad Pay</option>
                    <option value="Bank Transfer">Bank Wire</option>
                    <option value="Manual Cash">Manual Cash / Cheque</option>
                    <option value="Stripe">Stripe Card</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Transaction Reference (TrxID)</label>
                <Input
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value)}
                  placeholder="e.g. 9J28DA10K or leave blank to auto-generate"
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                >
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending Verification</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Notes / Reference</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Invoice #2026-09 subscription fee"
                  className="text-xs h-9"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                >
                  {isSubmitting ? 'Recording...' : 'Record Transaction'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!paymentToDelete}
        onClose={() => setPaymentToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        isDestructive={true}
        title={`Delete Payment Record: ${paymentToDelete?.trx_id}?`}
        description="This will permanently delete this revenue transaction from the central billing ledger."
        confirmText="Confirm Delete"
      />
    </div>
  );
}
