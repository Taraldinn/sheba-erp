import React, { useEffect, useState } from 'react';
import {
  Plus,
  SearchLg,
  CreditCard01,
  Download01,
  Copy01,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { Payment, Tenant } from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

export function PaymentsScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'succeeded' | 'failed' | 'refunded'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    tenant_name: '',
    amount: 149,
    currency: 'USD',
    payment_method: 'Stripe (Credit Card)',
  });

  const loadData = async () => {
    try {
      const [pays, tns] = await Promise.all([saasApi.getPayments(), saasApi.getTenants()]);
      setPayments(pays);
      setTenants(tns);
      if (tns.length > 0 && !formData.tenant_name) {
        setFormData((prev) => ({ ...prev, tenant_name: tns[0].name }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saasApi.createPayment({
        tenant_name: formData.tenant_name,
        amount: Number(formData.amount),
        currency: formData.currency,
        payment_method: formData.payment_method,
        status: 'succeeded',
      });
      setIsAddOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefund = async (id: string) => {
    if (!confirm('Are you sure you want to issue a refund for this transaction?')) return;
    try {
      await saasApi.refundPayment(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      (p.tenant_name && p.tenant_name.toLowerCase().includes(search.toLowerCase())) ||
      (p.payment_method && p.payment_method.toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const totalSucceeded = payments
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Billing & Payments</h1>
            <Badge color="success" size="sm">
              PCI Compliant
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Real-time multi-tenant transaction ledgers, invoices, and payment provider integrations.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => setIsAddOpen(true)}
          >
            Record Payment
          </Button>
        </div>
      </div>

      {/* Financial Metrics Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase text-tertiary">Total Volume Collected</div>
          <div className="mt-2 text-2xl font-bold text-primary">
            ${totalSucceeded.toLocaleString()} <span className="text-xs text-tertiary font-normal">USD</span>
          </div>
          <p className="mt-1 text-xs text-success-primary">100% payout reconciliation</p>
        </div>

        <div className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase text-tertiary">Processed Transactions</div>
          <div className="mt-2 text-2xl font-bold text-primary">{payments.length}</div>
          <p className="mt-1 text-xs text-tertiary">Stripe Connect & Direct ACH</p>
        </div>

        <div className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase text-tertiary">Failed Transactions</div>
          <div className="mt-2 text-2xl font-bold text-primary">
            {payments.filter((p) => p.status === 'failed').length}
          </div>
          <p className="mt-1 text-xs text-quaternary">Automated dunning retry active</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <div className="w-full sm:w-80">
          <Input
            aria-label="Search payments"
            placeholder="Search transaction ID, tenant, method..."
            icon={SearchLg}
            size="sm"
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-medium text-tertiary">Status:</span>
          {(['all', 'succeeded', 'failed', 'refunded'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === filter
                  ? 'bg-brand-primary_alt text-brand-secondary ring-1 ring-brand'
                  : 'text-tertiary hover:bg-secondary'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <TableCard.Root>
        <TableCard.Header
          title="Payment Ledgers"
          badge={`${filteredPayments.length} Items`}
          description="Invoices, credit card charges, and bank transfers"
        />
        <Table aria-label="Payments Table">
          <Table.Header>
            <Table.Head id="id" isRowHeader>Transaction ID</Table.Head>
            <Table.Head id="tenant">Tenant</Table.Head>
            <Table.Head id="amount">Amount</Table.Head>
            <Table.Head id="method">Method</Table.Head>
            <Table.Head id="status">Status</Table.Head>
            <Table.Head id="date">Date</Table.Head>
            <Table.Head id="actions">Actions</Table.Head>
          </Table.Header>
          <Table.Body items={filteredPayments}>
            {(pay) => (
              <Table.Row id={pay.id}>
                <Table.Cell>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-secondary">
                    <span>{pay.id}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(pay.id);
                        alert(`Copied ${pay.id}`);
                      }}
                      className="text-quaternary hover:text-primary"
                    >
                      <Copy01 className="size-3" />
                    </button>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-medium text-primary text-sm">
                    {pay.tenant_name || 'Standard Account'}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-semibold text-primary text-sm">
                    ${pay.amount} <span className="text-[11px] text-tertiary font-normal">USD</span>
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-xs text-secondary">{pay.payment_method || 'Card (Online)'}</span>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    color={
                      pay.status === 'succeeded'
                        ? 'success'
                        : pay.status === 'failed'
                        ? 'error'
                        : pay.status === 'refunded'
                        ? 'gray'
                        : 'warning'
                    }
                    size="sm"
                   
                  >
                    {pay.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-xs text-tertiary">
                    {new Date(pay.created_at).toLocaleDateString()}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Download01}
                      onPress={() => alert(`Downloading PDF Invoice for ${pay.id}`)}
                    >
                      Invoice
                    </Button>
                    {pay.status === 'succeeded' && (
                      <Button
                        size="sm"
                        color="secondary"
                        className="text-error-primary hover:text-error-solid"
                        onPress={() => handleRefund(pay.id)}
                      >
                        Refund
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Record Payment Modal */}
      <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleRecordPayment} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <CreditCard01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Record Manual Payment</h2>
                      <p className="text-xs text-tertiary">Log offline wire, ACH, or check settlement.</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Tenant Organization
                    </label>
                    <select
                      value={formData.tenant_name}
                      onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">
                        Amount Paid ($)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                        className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">
                        Payment Method
                      </label>
                      <select
                        value={formData.payment_method}
                        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                        className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                      >
                        <option value="Wire Transfer / ACH">Wire Transfer / ACH</option>
                        <option value="Stripe (Credit Card)">Stripe (Credit Card)</option>
                        <option value="Corporate Check">Corporate Check</option>
                        <option value="Direct Bank Deposit">Direct Bank Deposit</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Record Payment
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
