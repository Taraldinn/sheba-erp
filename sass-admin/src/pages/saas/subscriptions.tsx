import React, { useEffect, useState } from 'react';
import {
  Plus,
  SearchLg,
  Settings01,
  CreditCard01,
  Building07,
  Calendar,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { Subscription, Tenant, Package } from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

export function SubscriptionsScreen() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'canceled'>('all');

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [newPackageId, setNewPackageId] = useState('');

  // Form
  const [formData, setFormData] = useState({
    tenant_id: '',
    package_id: '',
  });

  const loadData = async () => {
    try {
      const [subs, tns, pkgs] = await Promise.all([
        saasApi.getSubscriptions(),
        saasApi.getTenants(),
        saasApi.getPackages(),
      ]);
      setSubscriptions(subs);
      setTenants(tns);
      setPackages(pkgs);
      if (tns.length > 0 && !formData.tenant_id) {
        setFormData((prev) => ({ ...prev, tenant_id: tns[0].id }));
      }
      if (pkgs.length > 0 && !formData.package_id) {
        setFormData((prev) => ({ ...prev, package_id: pkgs[0].id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tenant_id || !formData.package_id) return;
    try {
      await saasApi.createSubscription(formData);
      setIsAddOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !newPackageId) return;
    try {
      await saasApi.changeSubscriptionPackage(selectedSub.id, newPackageId);
      setIsChangeOpen(false);
      setSelectedSub(null);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelSub = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this tenant subscription?')) return;
    try {
      await saasApi.cancelSubscription(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredSubs = subscriptions.filter((sub) => {
    const matchesSearch =
      (sub.tenant_name && sub.tenant_name.toLowerCase().includes(search.toLowerCase())) ||
      (sub.package_name && sub.package_name.toLowerCase().includes(search.toLowerCase())) ||
      sub.tenant_id.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'active') return sub.status === 'active';
    if (statusFilter === 'canceled') return sub.status === 'canceled';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Tenant Subscriptions</h1>
            <Badge color="brand" size="sm">
              {subscriptions.filter((s) => s.status === 'active').length} Active
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Track customer recurring billing cycles, tier entitlements, and renewal periods.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => setIsAddOpen(true)}
          >
            Assign Subscription
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <div className="w-full sm:w-80">
          <Input
            aria-label="Search subscriptions"
            placeholder="Search tenant or plan..."
            icon={SearchLg}
            size="sm"
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-medium text-tertiary">Status:</span>
          {(['all', 'active', 'canceled'] as const).map((filter) => (
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

      {/* Subscriptions Table */}
      <TableCard.Root>
        <TableCard.Header
          title="Active & Historical Subscriptions"
          badge={`${filteredSubs.length} Records`}
          description="Tenant associations and scheduled renewal deadlines"
        />
        <Table aria-label="Subscriptions Table">
          <Table.Header>
            <Table.Head id="tenant" isRowHeader>Tenant Organization</Table.Head>
            <Table.Head id="plan">Subscribed Tier</Table.Head>
            <Table.Head id="status">Status</Table.Head>
            <Table.Head id="period">Current Period End</Table.Head>
            <Table.Head id="actions">Actions</Table.Head>
          </Table.Header>
          <Table.Body items={filteredSubs}>
            {(sub) => {
              const isExpired = new Date(sub.current_period_end).getTime() < Date.now();
              return (
                <Table.Row id={sub.id}>
                  <Table.Cell>
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-secondary flex items-center justify-center text-primary font-bold">
                        <Building07 className="size-4 text-brand-solid" />
                      </div>
                      <div>
                        <div className="font-semibold text-primary">{sub.tenant_name || sub.tenant_id}</div>
                        <div className="text-xs text-tertiary">ID: {sub.tenant_id}</div>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="gray" size="sm">
                      {sub.package_name || sub.package_id}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={
                        sub.status === 'active'
                          ? isExpired
                            ? 'warning'
                            : 'success'
                          : 'error'
                      }
                      size="sm"
                     
                    >
                      {sub.status === 'active' && isExpired ? 'Renewal Due' : sub.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-1.5 text-xs text-secondary">
                      <Calendar className="size-3.5 text-quaternary" />
                      <span>{new Date(sub.current_period_end).toLocaleDateString()}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        color="secondary"
                        onPress={() => {
                          setSelectedSub(sub);
                          setNewPackageId(sub.package_id);
                          setIsChangeOpen(true);
                        }}
                      >
                        Change Plan
                      </Button>
                      {sub.status === 'active' && (
                        <Button
                          size="sm"
                          color="secondary"
                          className="text-error-primary hover:text-error-solid"
                          onPress={() => handleCancelSub(sub.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              );
            }}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Assign Subscription Modal */}
      <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleCreateSubscription} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <CreditCard01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Assign Subscription</h2>
                      <p className="text-xs text-tertiary">Provision a billing plan for a tenant organization.</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Select Tenant
                    </label>
                    <select
                      value={formData.tenant_id}
                      onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Select Subscription Package
                    </label>
                    <select
                      value={formData.package_id}
                      onChange={(e) => setFormData({ ...formData, package_id: e.target.value })}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${p.price}/mo)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Activate Subscription
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Change Package Modal */}
      <ModalOverlay isOpen={isChangeOpen} onOpenChange={setIsChangeOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleChangePackage} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-secondary p-2 text-primary">
                      <Settings01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Upgrade or Change Plan</h2>
                      <p className="text-xs text-tertiary">{selectedSub?.tenant_name}</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <p className="text-xs text-tertiary">
                    Current plan: <strong className="text-primary">{selectedSub?.package_name}</strong>
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Choose New Subscription Tier
                    </label>
                    <select
                      value={newPackageId}
                      onChange={(e) => setNewPackageId(e.target.value)}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${p.price}/mo)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Confirm Tier Update
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
