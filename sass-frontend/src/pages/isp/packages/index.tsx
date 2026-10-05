import React, { useEffect, useState, useCallback } from 'react';
import { DataTable, type Column } from '@/components/application/table/data-table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { ispPackageApi, type IspPackageItem } from '@/api/client';
import { Plus, RefreshCw01, XClose } from '@untitledui/icons';

export function PackagesScreen() {
  const [packages, setPackages] = useState<IspPackageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPkg, setEditingPkg] = useState<IspPackageItem | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    mikrotik_profile: '',
    speed_mbps: 10,
    upload_speed_mbps: 10,
    validity_days: 30,
    regular_price: 500,
    description: '',
    is_active: true,
  });

  const loadPackages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await ispPackageApi.list({
        page,
        search: search || undefined,
      });
      setPackages(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load packages');
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingPkg) {
        await ispPackageApi.update(editingPkg.id, formData);
      } else {
        await ispPackageApi.create(formData);
      }
      setIsModalOpen(false);
      setEditingPkg(null);
      loadPackages();
    } catch (err: any) {
      alert(err?.message || 'Failed to save package');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncToRouters = async (id: string) => {
    try {
      const res = await ispPackageApi.syncToRouters(id);
      alert(res.message);
    } catch (err: any) {
      alert(err?.message || 'Failed to sync to routers');
    }
  };

  const columns: Column<IspPackageItem>[] = [
    {
      key: 'name',
      label: 'Package Plan',
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-semibold text-primary">{item.name}</span>
          <span className="text-xs text-tertiary font-mono">Profile: {item.mikrotik_profile}</span>
        </div>
      ),
    },
    {
      key: 'speed',
      label: 'Speed (Down/Up)',
      render: (item) => (
        <div className="text-sm font-medium text-secondary">
          {item.speed_mbps} Mbps / {item.upload_speed_mbps || item.speed_mbps} Mbps
        </div>
      ),
    },
    {
      key: 'regular_price',
      label: 'Price / Validity',
      render: (item) => (
        <div className="text-sm">
          <span className="font-bold text-primary">৳{item.regular_price}</span>
          <span className="text-xs text-tertiary ml-1.5">({item.validity_days} days)</span>
        </div>
      ),
    },
    {
      key: 'subscribers',
      label: 'Subscribers',
      render: (item) => (
        <span className="text-sm text-secondary font-medium">
          {item.subscribers_count ?? 0} active
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => (
        <Badge color={item.is_active ? 'success' : 'gray'}>
          {item.is_active ? 'Active' : 'Inactive'}
        </Badge>
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
            onClick={() => {
              setEditingPkg(item);
              setFormData({
                name: item.name,
                mikrotik_profile: item.mikrotik_profile,
                speed_mbps: item.speed_mbps,
                upload_speed_mbps: item.upload_speed_mbps || item.speed_mbps,
                validity_days: item.validity_days,
                regular_price: Number(item.regular_price),
                description: item.description || '',
                is_active: item.is_active,
              });
              setIsModalOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            color="secondary"
            aria-label="Synchronize profile to routers"
            onClick={() => handleSyncToRouters(item.id)}
          >
            Sync
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Service Packages & Tariffs</h1>
          <p className="text-sm text-tertiary">
            Broadband tiers, rate limits, and billing intervals provisioned across customer services.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="md" color="secondary" onClick={loadPackages} isDisabled={isLoading}>
            <RefreshCw01 className={`size-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            size="md"
            color="primary"
            onClick={() => {
              setEditingPkg(null);
              setFormData({
                name: '',
                mikrotik_profile: '',
                speed_mbps: 20,
                upload_speed_mbps: 20,
                validity_days: 30,
                regular_price: 800,
                description: '',
                is_active: true,
              });
              setIsModalOpen(true);
            }}
          >
            <Plus className="size-4 mr-1.5" /> Create Package
          </Button>
        </div>
      </div>

      <DataTable
        title="Packages"
        description={`${total} available broadband packages`}
        columns={columns}
        data={packages}
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
        onRetry={loadPackages}
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-primary rounded-xl border border-secondary shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-secondary pb-3">
              <h3 className="font-semibold text-primary">
                {editingPkg ? 'Edit Package' : 'Create Broadband Package'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-tertiary hover:text-primary">
                <XClose className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Package Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ultra 50 Mbps"
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData({
                      ...formData,
                      name,
                      mikrotik_profile: formData.mikrotik_profile || name.toLowerCase().replace(/\s+/g, '_'),
                    });
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">MikroTik PPP Profile *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ultra_50mbps"
                  className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary font-mono"
                  value={formData.mikrotik_profile}
                  onChange={(e) => setFormData({ ...formData, mikrotik_profile: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Download (Mbps)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                    value={formData.speed_mbps}
                    onChange={(e) => setFormData({ ...formData, speed_mbps: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Upload (Mbps)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                    value={formData.upload_speed_mbps}
                    onChange={(e) => setFormData({ ...formData, upload_speed_mbps: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Price (৳) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                    value={formData.regular_price}
                    onChange={(e) => setFormData({ ...formData, regular_price: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full bg-secondary border border-secondary rounded px-3 py-2 text-sm text-primary"
                    value={formData.validity_days}
                    onChange={(e) => setFormData({ ...formData, validity_days: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-secondary">
                <Button size="sm" color="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" color="primary" type="submit" isDisabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingPkg ? 'Update Package' : 'Create Package'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
