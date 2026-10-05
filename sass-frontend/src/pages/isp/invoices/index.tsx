import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/application/table/data-table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { invoiceApi, type IspInvoiceItem } from '@/api/client';
import { RefreshCw01, XClose } from '@untitledui/icons';

export function InvoicesScreen() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<IspInvoiceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pay Modal
  const [selectedInvoice, setSelectedInvoice] = useState<IspInvoiceItem | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [isPayOpen, setIsPayOpen] = useState(false);

  const loadInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await invoiceApi.list({
        page,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setInvoices(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load invoices');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const handleIssue = async (id: string) => {
    try {
      await invoiceApi.issue(id);
      loadInvoices();
    } catch (err: any) {
      alert(err?.message || 'Failed to issue invoice');
    }
  };

  const handleVoid = async (id: string) => {
    const reason = prompt('Reason for voiding:', 'Billing error') || '';
    try {
      await invoiceApi.void(id, reason);
      loadInvoices();
    } catch (err: any) {
      alert(err?.message || 'Failed to void invoice');
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      await invoiceApi.pay(selectedInvoice.id, {
        amount: payAmount,
        payment_method: payMethod,
      });
      setIsPayOpen(false);
      setSelectedInvoice(null);
      loadInvoices();
    } catch (err: any) {
      alert(err?.message || 'Failed to process payment');
    }
  };

  const columns: Column<IspInvoiceItem>[] = [
    {
      key: 'invoice_no',
      label: 'Invoice #',
      render: (item) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {item.invoice_no}
        </span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (item) => (
        <div className="flex flex-col">
          <span
            className="font-semibold text-primary hover:text-brand-primary cursor-pointer"
            onClick={() => navigate(`/customers/${item.customer}`)}
          >
            {item.customer_name || 'Subscriber'}
          </span>
          <span className="text-xs text-tertiary">
            {item.customer_username || item.service_identifier || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'billing_month',
      label: 'Billing Period',
      render: (item) => <span className="text-sm text-secondary">{item.billing_month}</span>,
    },
    {
      key: 'total_payable',
      label: 'Total / Balance',
      render: (item) => (
        <div className="text-sm">
          <span className="font-bold text-primary">৳{item.total_payable}</span>
          {Number(item.due_amount) > 0 ? (
            <span className="text-xs text-error font-medium ml-1.5">(Due ৳{item.due_amount})</span>
          ) : (
            <span className="text-xs text-success font-medium ml-1.5">(Paid)</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => {
        let badgeColor: 'success' | 'warning' | 'error' | 'gray' = 'gray';
        if (item.status === 'PAID') badgeColor = 'success';
        else if (item.status === 'ISSUED' || item.status === 'UNPAID' || item.status === 'PARTIAL') badgeColor = 'warning';
        else if (item.status === 'CANCELLED' || item.status === 'VOID') badgeColor = 'error';
        return <Badge color={badgeColor}>{item.status}</Badge>;
      },
    },
    {
      key: 'due_date',
      label: 'Due Date',
      render: (item) => (
        <span className="text-sm text-secondary">{item.due_date || '—'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      className: 'text-right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {item.status === 'DRAFT' && (
            <Button size="sm" color="secondary" onClick={() => handleIssue(item.id)}>
              Issue
            </Button>
          )}
          {(item.status === 'ISSUED' || item.status === 'UNPAID' || item.status === 'PARTIAL') && (
            <Button
              size="sm"
              color="primary"
              onClick={() => {
                setSelectedInvoice(item);
                setPayAmount(Number(item.due_amount) || Number(item.total_payable));
                setIsPayOpen(true);
              }}
            >
              Pay
            </Button>
          )}
          {item.status !== 'PAID' && item.status !== 'VOID' && (
            <Button size="sm" color="secondary" onClick={() => handleVoid(item.id)}>
              Void
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Invoices & Billing</h1>
          <p className="text-sm text-tertiary">
            Commercial subscriber invoices, billing cycles, payment allocations, and receivables.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="md" color="secondary" onClick={loadInvoices} isDisabled={isLoading}>
            <RefreshCw01 className={`size-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-secondary/50 p-3 rounded-lg border border-secondary">
        <select
          className="bg-primary border border-secondary rounded px-3 py-1.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-brand"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="UNPAID">Unpaid / Due</option>
          <option value="PAID">Paid</option>
          <option value="ISSUED">Issued</option>
          <option value="DRAFT">Draft</option>
          <option value="VOID">Void</option>
        </select>
      </div>

      <DataTable
        title="Subscriber Invoices"
        description={`${total} invoice record${total === 1 ? '' : 's'}`}
        columns={columns}
        data={invoices}
        totalCount={total}
        page={page}
        pageSize={pageSize}
        isLoading={isLoading}
        error={error}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        onSearchChange={(q) => {
          setSearch(q);
          setPage(1);
        }}
        onRetry={loadInvoices}
      />

      {/* Pay Modal */}
      {isPayOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-primary rounded-xl border border-secondary shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-secondary pb-3">
              <div>
                <h3 className="font-semibold text-primary">Process Invoice Payment</h3>
                <p className="text-xs text-tertiary">Invoice #{selectedInvoice.invoice_no}</p>
              </div>
              <button onClick={() => setIsPayOpen(false)} className="text-tertiary hover:text-primary">
                <XClose className="size-5" />
              </button>
            </div>

            <form onSubmit={handlePaySubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Amount to Pay (৳) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Payment Method</label>
                <select
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-secondary">
                <Button size="sm" color="secondary" type="button" onClick={() => setIsPayOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" color="primary" type="submit">
                  Confirm Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
