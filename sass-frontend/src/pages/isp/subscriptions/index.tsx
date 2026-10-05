import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/application/table/data-table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { subscriptionApi, type CustomerSubscriptionItem } from '@/api/client';
import { RefreshCw01, Play, PauseCircle } from '@untitledui/icons';

export function SubscriptionsScreen() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState<CustomerSubscriptionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubscriptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await subscriptionApi.list({
        page,
        status: statusFilter || undefined,
      });
      setSubscriptions(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load subscriptions');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const handleActivate = async (id: string) => {
    try {
      await subscriptionApi.activate(id);
      loadSubscriptions();
    } catch (err: any) {
      alert(err?.message || 'Failed to activate');
    }
  };

  const handleSuspend = async (id: string) => {
    try {
      await subscriptionApi.suspend(id);
      loadSubscriptions();
    } catch (err: any) {
      alert(err?.message || 'Failed to suspend');
    }
  };

  const handleRenew = async (id: string) => {
    try {
      await subscriptionApi.renew(id, 30);
      loadSubscriptions();
    } catch (err: any) {
      alert(err?.message || 'Failed to renew');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this subscription?')) return;
    try {
      await subscriptionApi.cancel(id);
      loadSubscriptions();
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel');
    }
  };

  const columns: Column<CustomerSubscriptionItem>[] = [
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
            {item.customer_code ? `#${item.customer_code}` : item.customer.slice(0, 8)}
          </span>
        </div>
      ),
    },
    {
      key: 'service',
      label: 'Service Identifier',
      render: (item) => (
        <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded text-primary">
          {item.service_identifier || 'Broadband Line'}
        </span>
      ),
    },
    {
      key: 'package',
      label: 'Package & Cycle',
      render: (item) => (
        <div className="text-sm">
          <span className="font-medium text-primary">{item.package_name || 'Custom Tier'}</span>
          <span className="text-xs text-tertiary ml-1.5">({item.billing_cycle})</span>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      render: (item) => (
        <span className="font-semibold text-primary">৳{item.price}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => {
        let badgeColor: 'success' | 'warning' | 'error' | 'gray' = 'gray';
        if (item.status === 'ACTIVE') badgeColor = 'success';
        else if (item.status === 'SUSPENDED' || item.status === 'PAUSED') badgeColor = 'warning';
        else if (item.status === 'CANCELLED' || item.status === 'EXPIRED') badgeColor = 'error';
        return <Badge color={badgeColor}>{item.status}</Badge>;
      },
    },
    {
      key: 'next_billing_date',
      label: 'Next Billing',
      render: (item) => (
        <span className="text-sm text-secondary">
          {item.next_billing_date || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      className: 'text-right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {item.status === 'PENDING' && (
            <Button size="sm" color="secondary" onClick={() => handleActivate(item.id)}>
              <Play className="size-3 text-success mr-1" /> Activate
            </Button>
          )}
          {item.status === 'ACTIVE' && (
            <>
              <Button size="sm" color="secondary" onClick={() => handleRenew(item.id)}>
                Renew
              </Button>
              <Button size="sm" color="secondary" onClick={() => handleSuspend(item.id)}>
                <PauseCircle className="size-3 text-warning" />
              </Button>
            </>
          )}
          {item.status !== 'CANCELLED' && (
            <Button size="sm" color="secondary" onClick={() => handleCancel(item.id)}>
              Cancel
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
          <h1 className="text-2xl font-bold tracking-tight text-primary">Customer Subscriptions</h1>
          <p className="text-sm text-tertiary">
            Active commercial subscription agreements, renewal terms, and recurring billing cycles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="md" color="secondary" onClick={loadSubscriptions} isDisabled={isLoading}>
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
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="PENDING">Pending</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <DataTable
        title="Subscriptions"
        description={`${total} registered subscriber agreement${total === 1 ? '' : 's'}`}
        columns={columns}
        data={subscriptions}
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
        onRetry={loadSubscriptions}
      />
    </div>
  );
}
