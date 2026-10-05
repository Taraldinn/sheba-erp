import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/application/table/data-table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import {
  customerApi,
  ispPackageApi,
  type CustomerItem,
  type CustomerCreatePayload,
  type IspPackageItem,
} from '@/api/client';
import {
  Plus,
  RefreshCw01,
  UserCheck01,
  UserX01,
  Archive,
  Eye,
  CheckCircle,
  AlertCircle,
  XClose,
} from '@untitledui/icons';

export function CustomersScreen() {
  const navigate = useNavigate();

  // Table state
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packages, setPackages] = useState<IspPackageItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<CustomerCreatePayload>({
    full_name: '',
    mobile: '',
    pppoe_username: '',
    pppoe_password: 'Password123!',
    customer_code: '',
    email: '',
    address: '',
    package: '',
    monthly_bill: 500,
    status: 'Active',
  });

  // Fetch customers
  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await customerApi.list({
        page,
        page_size: pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setCustomers(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Load packages for create modal
  useEffect(() => {
    if (isCreateOpen) {
      ispPackageApi.list().then((res) => {
        setPackages(res.items);
        if (res.items.length > 0 && !formData.package) {
          setFormData((prev) => ({
            ...prev,
            package: res.items[0].id,
            monthly_bill: res.items[0].regular_price,
          }));
        }
      }).catch(() => {});
    }
  }, [isCreateOpen]);

  // Handle Create Customer submit
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.mobile || !formData.pppoe_username) {
      setFormError('Please fill in Name, Phone, and PPPoE Username.');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const created = await customerApi.create(formData);
      setFormSuccess(`Customer ${created.full_name} created successfully.`);
      setTimeout(() => {
        setIsCreateOpen(false);
        setFormSuccess(null);
        loadCustomers();
      }, 800);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Quick Archive
  const handleArchive = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to archive customer "${name}"?`)) return;
    try {
      await customerApi.archive(id);
      loadCustomers();
    } catch (err: any) {
      alert(err?.message || 'Failed to archive customer');
    }
  };

  // Handle Quick Status toggle
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await customerApi.changeStatus(id, newStatus);
      loadCustomers();
    } catch (err: any) {
      alert(err?.message || 'Failed to change status');
    }
  };

  const columns: Column<CustomerItem>[] = [
    {
      key: 'customer',
      label: 'Customer',
      render: (item) => (
        <div className="flex flex-col">
          <span
            className="font-semibold text-primary hover:text-brand-primary cursor-pointer"
            onClick={() => navigate(`/customers/${item.id}`)}
          >
            {item.full_name}
          </span>
          <span className="text-xs text-tertiary">
            {item.customer_code ? `#${item.customer_code} · ` : ''}
            {item.email || item.mobile}
          </span>
        </div>
      ),
    },
    {
      key: 'pppoe_username',
      label: 'PPPoE Username',
      render: (item) => (
        <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded text-primary">
          {item.pppoe_username}
        </span>
      ),
    },
    {
      key: 'mobile',
      label: 'Phone',
      render: (item) => <span className="text-sm text-secondary">{item.mobile}</span>,
    },
    {
      key: 'package_name',
      label: 'Package & Speed',
      render: (item) => (
        <div className="text-sm">
          <span className="font-medium text-primary">{item.package_name || 'No Package'}</span>
          {item.package_speed ? (
            <span className="text-xs text-tertiary ml-1.5">({item.package_speed} Mbps)</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => {
        let badgeColor: 'success' | 'warning' | 'error' | 'gray' = 'gray';
        if (item.status === 'Active') badgeColor = 'success';
        else if (item.status === 'Suspended') badgeColor = 'warning';
        else if (item.status === 'Expired' || item.status === 'Left') badgeColor = 'error';
        return <Badge color={badgeColor}>{item.status}</Badge>;
      },
    },
    {
      key: 'monthly_bill',
      label: 'Bill / Due',
      render: (item) => (
        <div className="text-sm">
          <span className="font-medium text-primary">৳{item.monthly_bill}</span>
          {Number(item.due_amount) > 0 && (
            <span className="text-xs text-error font-medium ml-1.5">(Due ৳{item.due_amount})</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      className: 'text-right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            color="secondary"
            aria-label="View Details"
            onClick={() => navigate(`/customers/${item.id}`)}
          >
            <Eye className="size-3.5 mr-1" /> View
          </Button>

          {item.status === 'Active' ? (
            <Button
              size="sm"
              color="secondary"
              aria-label="Suspend"
              onClick={() => handleStatusChange(item.id, 'Suspended')}
            >
              <UserX01 className="size-3.5 text-warning" />
            </Button>
          ) : item.status === 'Suspended' ? (
            <Button
              size="sm"
              color="secondary"
              aria-label="Activate"
              onClick={() => handleStatusChange(item.id, 'Active')}
            >
              <UserCheck01 className="size-3.5 text-success" />
            </Button>
          ) : null}

          {item.status !== 'Archived' && (
            <Button
              size="sm"
              color="secondary"
              aria-label="Archive"
              onClick={() => handleArchive(item.id, item.full_name)}
            >
              <Archive className="size-3.5 text-tertiary" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Customers & Subscribers</h1>
          <p className="text-sm text-tertiary">
            Central repository of subscriber profiles, line credentials, and active services.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="md" color="secondary" onClick={loadCustomers} isDisabled={isLoading}>
            <RefreshCw01 className={`size-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="md" color="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-secondary/50 p-3 rounded-lg border border-secondary">
        <select
          className="bg-primary border border-secondary rounded px-3 py-1.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-brand"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Expired">Expired</option>
          <option value="Archived">Archived</option>
        </select>
      </div>

      {/* Data Table */}
      <DataTable
        title="Subscribers"
        description={`${total} registered customer${total === 1 ? '' : 's'}`}
        columns={columns}
        data={customers}
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
        onRetry={loadCustomers}
      />

      {/* Create Customer Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-primary rounded-xl border border-secondary shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-secondary">
              <div>
                <h3 className="text-lg font-semibold text-primary">Add New Customer</h3>
                <p className="text-xs text-tertiary">Provisions subscriber profile and initial broadband service.</p>
              </div>
              <button
                type="button"
                className="text-tertiary hover:text-primary p-1 rounded-md"
                onClick={() => setIsCreateOpen(false)}
              >
                <XClose className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-5 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 p-3 text-xs text-error bg-error-secondary rounded-lg border border-error">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="flex items-center gap-2 p-3 text-xs text-success bg-success-secondary rounded-lg border border-success">
                  <CheckCircle className="size-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahim Uddin"
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +8801711223344"
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">PPPoE Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. rahim_50m"
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand font-mono"
                    value={formData.pppoe_username}
                    onChange={(e) => setFormData({ ...formData, pppoe_username: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">PPPoE Password *</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand font-mono"
                    value={formData.pppoe_password}
                    onChange={(e) => setFormData({ ...formData, pppoe_password: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Assigned Package</label>
                  <select
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                    value={formData.package || ''}
                    onChange={(e) => {
                      const selected = packages.find((p) => p.id === e.target.value);
                      setFormData({
                        ...formData,
                        package: e.target.value,
                        monthly_bill: selected ? selected.regular_price : formData.monthly_bill,
                      });
                    }}
                  >
                    <option value="">None / Custom</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.speed_mbps} Mbps - ৳{pkg.regular_price})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Monthly Bill (৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                    value={formData.monthly_bill}
                    onChange={(e) => setFormData({ ...formData, monthly_bill: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Customer Code / ID</label>
                  <input
                    type="text"
                    placeholder="e.g. CUS-101"
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                    value={formData.customer_code}
                    onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Installation Address</label>
                <textarea
                  rows={2}
                  placeholder="Street address, building, apartment..."
                  className="w-full bg-secondary border border-secondary rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-secondary">
                <Button size="md" color="secondary" type="button" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button size="md" color="primary" type="submit" isDisabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Create Customer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
