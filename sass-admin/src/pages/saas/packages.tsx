import React, { useEffect, useState } from 'react';
import {
  Plus,
  CheckCircle,
  Edit01,
  Trash01,
  PieChart03,
  Users01,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { Package } from '@/api/types';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import { Select } from '@/components/base/select/select';

export function PackagesScreen() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: 99,
    currency: 'USD',
    featuresText: '',
    is_active: true,
  });

  const loadPackages = async () => {
    try {
      const data = await saasApi.getPackages();
      setPackages(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    try {
      const features = formData.featuresText
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);

      await saasApi.createPackage({
        name: formData.name,
        price: Number(formData.price),
        currency: formData.currency,
        features: features.length > 0 ? features : ['Standard enterprise capabilities'],
        is_active: formData.is_active,
      });
      setIsAddOpen(false);
      setFormData({ name: '', price: 99, currency: 'USD', featuresText: '', is_active: true });
      loadPackages();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;
    try {
      const features = formData.featuresText
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);

      await saasApi.updatePackage(selectedPackage.id, {
        name: formData.name,
        price: Number(formData.price),
        currency: formData.currency,
        features,
        is_active: formData.is_active,
      });
      setIsEditOpen(false);
      setSelectedPackage(null);
      loadPackages();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePackage = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subscription plan?')) return;
    try {
      await saasApi.deletePackage(id);
      loadPackages();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (pkg: Package) => {
    setSelectedPackage(pkg);
    setFormData({
      name: pkg.name,
      price: pkg.price,
      currency: pkg.currency,
      featuresText: pkg.features.join('\n'),
      is_active: pkg.is_active,
    });
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Subscription Packages</h1>
            <Badge color="brand" size="sm">
              {packages.length} Active Plans
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Define pricing tiers, billing rates, resource allocations, and feature entitlements.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => {
              setFormData({ name: '', price: 99, currency: 'USD', featuresText: 'Dedicated Support\nAPI Access\nDaily Backups', is_active: true });
              setIsAddOpen(true);
            }}
          >
            Create Package
          </Button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="relative flex flex-col justify-between rounded-2xl border border-secondary bg-primary p-6 shadow-sm transition hover:shadow-md"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-primary">{pkg.name}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-tertiary">
                    <Users01 className="size-3.5" />
                    <span>{pkg.subscriber_count ?? 12} active subscribers</span>
                  </div>
                </div>
                <Badge
                  color={pkg.is_active ? 'success' : 'error'}
                  size="sm"
                 
                >
                  {pkg.is_active ? 'Available' : 'Archived'}
                </Badge>
              </div>

              {/* Price Display */}
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-primary">
                  ${pkg.price}
                </span>
                <span className="text-xs font-semibold uppercase text-tertiary">
                  {pkg.currency} / month
                </span>
              </div>

              {/* Feature Checklist */}
              <div className="mt-6 space-y-3 border-t border-secondary pt-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-quaternary">
                  Included Entitlements
                </div>
                <ul className="space-y-2.5">
                  {pkg.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-secondary">
                      <CheckCircle className="size-4 shrink-0 text-success-solid mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 flex items-center gap-2 border-t border-secondary pt-5">
              <Button
                color="secondary"
                size="sm"
                iconLeading={Edit01}
                className="flex-1"
                onPress={() => openEditModal(pkg)}
              >
                Edit Package
              </Button>
              <Button
                color="secondary"
                size="sm"
                iconLeading={Trash01}
                className="text-error-primary hover:text-error-solid"
                onPress={() => handleDeletePackage(pkg.id)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Create Package Modal */}
      <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleCreatePackage} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <PieChart03 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">New Subscription Tier</h2>
                      <p className="text-xs text-tertiary">Set tier name, monthly price, and feature list.</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <Input
                    label="Package Name"
                    placeholder="e.g. Growth Tier"
                    value={formData.name}
                    onChange={(val) => setFormData({ ...formData, name: val })}
                    isRequired
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">
                        Monthly Price ($)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                        className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                        required
                      />
                    </div>
                    <Select
                      label="Currency"
                      selectedKey={formData.currency}
                      onSelectionChange={(key) => setFormData({ ...formData, currency: String(key) })}
                    >
                      <Select.Item id="USD" label="USD ($)">USD ($)</Select.Item>
                      <Select.Item id="EUR" label="EUR (€)">EUR (€)</Select.Item>
                      <Select.Item id="GBP" label="GBP (£)">GBP (£)</Select.Item>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Features List (one per line)
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Up to 10 users&#10;100GB Storage&#10;Custom Domain"
                      value={formData.featuresText}
                      onChange={(e) => setFormData({ ...formData, featuresText: e.target.value })}
                      className="w-full rounded-lg border border-secondary bg-primary p-2.5 text-xs text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Publish Package
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Edit Package Modal */}
      <ModalOverlay isOpen={isEditOpen} onOpenChange={setIsEditOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleUpdatePackage} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-secondary p-2 text-primary">
                      <Edit01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Edit Package</h2>
                      <p className="text-xs text-tertiary">{selectedPackage?.name}</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <Input
                    label="Package Name"
                    value={formData.name}
                    onChange={(val) => setFormData({ ...formData, name: val })}
                    isRequired
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">
                        Monthly Price ($)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                        className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                        required
                      />
                    </div>
                    <Select
                      label="Currency"
                      selectedKey={formData.currency}
                      onSelectionChange={(key) => setFormData({ ...formData, currency: String(key) })}
                    >
                      <Select.Item id="USD" label="USD ($)">USD ($)</Select.Item>
                      <Select.Item id="EUR" label="EUR (€)">EUR (€)</Select.Item>
                      <Select.Item id="GBP" label="GBP (£)">GBP (£)</Select.Item>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Features List (one per line)
                    </label>
                    <textarea
                      rows={4}
                      value={formData.featuresText}
                      onChange={(e) => setFormData({ ...formData, featuresText: e.target.value })}
                      className="w-full rounded-lg border border-secondary bg-primary p-2.5 text-xs text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Save Changes
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
