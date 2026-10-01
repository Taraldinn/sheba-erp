import React, { useEffect, useState } from 'react';
import {
  Plus,
  SearchLg,
  Edit01,
  Trash01,
  LinkExternal01,
  Building07,
  Folder,
  Activity,
  Sliders01,
  Users01,
  ShieldTick,
  Key01,
  Server01,
  Copy01,
  LogIn01,
  CheckCircle,
  RefreshCw01,
  Check,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import {
  Tenant,
  TenantTelemetry,
  TenantFeatureFlag,
  TenantAdmin,
  ImpersonateResult,
} from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

export function TenantsScreen() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // Manage Slideout Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTenant, setDrawerTenant] = useState<Tenant | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'telemetry' | 'features' | 'admins'>('overview');

  // Telemetry, Features & Admins inside Drawer
  const [telemetry, setTelemetry] = useState<TenantTelemetry | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  const [features, setFeatures] = useState<TenantFeatureFlag[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featureActionFeedback, setFeatureActionFeedback] = useState<string | null>(null);

  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    phone: '',
  });

  // 1-Click Impersonation State
  const [isImpersonateOpen, setIsImpersonateOpen] = useState(false);
  const [impersonateData, setImpersonateData] = useState<ImpersonateResult | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Add / Edit Tenant Form
  const [formData, setFormData] = useState({
    name: '',
    schema_name: '',
    domain_url: '',
    plan: 'Professional Tier',
    contact_email: '',
  });

  const loadTenants = async () => {
    try {
      setLoading(true);
      const data = await saasApi.getTenants();
      setTenants(data);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  // Filtered tenants
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.schema_name.toLowerCase().includes(search.toLowerCase()) ||
      t.domain_url.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'active') return t.is_active;
    if (statusFilter === 'suspended') return !t.is_active;
    return true;
  });

  // Checkbox helpers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredTenants.map((t) => t.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  // Bulk Operations
  const handleBulkActivate = async () => {
    if (!selectedIds.length) return;
    try {
      await saasApi.bulkActivate(selectedIds);
      setSelectedIds([]);
      loadTenants();
    } catch (err) {
      console.error('Bulk activate error:', err);
    }
  };

  const handleBulkSuspend = async () => {
    if (!selectedIds.length) return;
    try {
      await saasApi.bulkSuspend(selectedIds);
      setSelectedIds([]);
      loadTenants();
    } catch (err) {
      console.error('Bulk suspend error:', err);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected tenants?`)) return;
    try {
      await saasApi.bulkDelete(selectedIds);
      setSelectedIds([]);
      loadTenants();
    } catch (err) {
      console.error('Bulk delete error:', err);
    }
  };

  // Tenant Creation / Update
  const handleNameChange = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    setFormData((prev) => ({
      ...prev,
      name,
      schema_name:
        prev.schema_name === '' ||
        prev.schema_name === prev.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
          ? slug
          : prev.schema_name,
      domain_url:
        prev.domain_url === '' || prev.domain_url.includes('.sheba.app')
          ? `${slug || 'app'}.sheba.app`
          : prev.domain_url,
    }));
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    try {
      await saasApi.createTenant({
        name: formData.name,
        schema_name: formData.schema_name,
        domain_url: formData.domain_url,
        plan: formData.plan,
        contact_email: formData.contact_email,
        is_active: true,
      });
      setIsAddOpen(false);
      setFormData({ name: '', schema_name: '', domain_url: '', plan: 'Professional Tier', contact_email: '' });
      loadTenants();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    try {
      await saasApi.updateTenant(selectedTenant.id, formData);
      setIsEditOpen(false);
      setSelectedTenant(null);
      loadTenants();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    try {
      await saasApi.toggleTenantStatus(tenant.id);
      loadTenants();
      if (drawerTenant?.id === tenant.id) {
        setDrawerTenant({ ...drawerTenant, is_active: !drawerTenant.is_active });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTenant = async () => {
    if (!selectedTenant) return;
    try {
      await saasApi.deleteTenant(selectedTenant.id);
      setIsDeleteOpen(false);
      setSelectedTenant(null);
      if (drawerTenant?.id === selectedTenant.id) {
        setIsDrawerOpen(false);
      }
      loadTenants();
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickBackup = async (tenant: Tenant) => {
    try {
      await saasApi.createBackup(tenant.id, 'full');
      alert(`Automated backup snapshot created for ${tenant.name}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Open Drawer and load drawer tabs
  const openManageDrawer = async (tenant: Tenant, tab: 'overview' | 'telemetry' | 'features' | 'admins' = 'overview') => {
    setDrawerTenant(tenant);
    setDrawerTab(tab);
    setIsDrawerOpen(true);

    // Preload tab data
    if (tab === 'telemetry') loadTelemetry(tenant.id);
    if (tab === 'features') loadFeatures(tenant.id);
    if (tab === 'admins') loadAdmins(tenant.id);
  };

  const loadTelemetry = async (tenantId: string) => {
    try {
      setTelemetryLoading(true);
      const data = await saasApi.getTenantTelemetry(tenantId);
      setTelemetry(data);
    } catch (err) {
      console.error('Failed to load telemetry:', err);
    } finally {
      setTelemetryLoading(false);
    }
  };

  const loadFeatures = async (tenantId: string) => {
    try {
      setFeaturesLoading(true);
      const res = await saasApi.getTenantFeatures(tenantId);
      setFeatures(res.features || []);
    } catch (err) {
      console.error('Failed to load features:', err);
    } finally {
      setFeaturesLoading(false);
    }
  };

  const loadAdmins = async (tenantId: string) => {
    try {
      setAdminsLoading(true);
      const list = await saasApi.getTenantAdmins(tenantId);
      setAdmins(list);
    } catch (err) {
      console.error('Failed to load admins:', err);
    } finally {
      setAdminsLoading(false);
    }
  };

  const handleDrawerTabChange = (tab: 'overview' | 'telemetry' | 'features' | 'admins') => {
    setDrawerTab(tab);
    if (!drawerTenant) return;
    if (tab === 'telemetry') loadTelemetry(drawerTenant.id);
    if (tab === 'features') loadFeatures(drawerTenant.id);
    if (tab === 'admins') loadAdmins(drawerTenant.id);
  };

  const handleToggleFeature = async (featureKey: string, currentEnabled: boolean) => {
    if (!drawerTenant) return;
    const newEnabled = !currentEnabled;
    // Optimistic UI update
    setFeatures((prev) =>
      prev.map((f) => (f.key === featureKey ? { ...f, enabled: newEnabled } : f))
    );
    try {
      await saasApi.updateTenantFeature(drawerTenant.id, featureKey, newEnabled);
      setFeatureActionFeedback(`Feature "${featureKey}" successfully ${newEnabled ? 'enabled' : 'disabled'}.`);
      setTimeout(() => setFeatureActionFeedback(null), 3000);
    } catch (err) {
      console.error('Feature toggle error:', err);
      // Revert optimistic update
      setFeatures((prev) =>
        prev.map((f) => (f.key === featureKey ? { ...f, enabled: currentEnabled } : f))
      );
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerTenant || !newAdmin.username) return;
    try {
      await saasApi.createTenantAdmin(drawerTenant.id, newAdmin);
      setNewAdmin({ username: '', email: '', password: '', full_name: '', phone: '' });
      setIsCreateAdminOpen(false);
      loadAdmins(drawerTenant.id);
    } catch (err) {
      console.error('Failed to create admin:', err);
    }
  };

  // 1-Click Super-Admin Impersonation
  const handleImpersonate = async (tenant: Tenant) => {
    try {
      const res = await saasApi.impersonateTenant(tenant.id);
      setImpersonateData(res);
      setCopiedToken(false);
      setIsImpersonateOpen(true);
    } catch (err) {
      console.error('Impersonation failed:', err);
      alert('Failed to establish impersonation session. Check tenant administrator records.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const openEditModal = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setFormData({
      name: tenant.name,
      schema_name: tenant.schema_name,
      domain_url: tenant.domain_url,
      plan: tenant.plan || 'Professional Tier',
      contact_email: tenant.contact_email || '',
    });
    setIsEditOpen(true);
  };

  const isAllSelected = filteredTenants.length > 0 && selectedIds.length === filteredTenants.length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Tenant Management</h1>
            <Badge color="brand" size="sm">
              {tenants.length} Organizations
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Super-Admin ISP control plane: provision multi-tenant PostgreSQL schemas, inspect live network telemetry, toggle feature flags, and manage administrators.
          </p>
        </div>
        <div className="mt-4 flex items-center gap-3 sm:mt-0">
          <Button
            color="secondary"
            size="md"
            iconLeading={RefreshCw01}
            onPress={loadTenants}
            isDisabled={loading}
          >
            Refresh
          </Button>
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => {
              setFormData({
                name: '',
                schema_name: '',
                domain_url: '',
                plan: 'Professional Tier',
                contact_email: '',
              });
              setIsAddOpen(true);
            }}
          >
            Provision Tenant
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <div className="w-full sm:w-80">
          <Input
            aria-label="Search tenants"
            placeholder="Search by name, schema, or domain..."
            icon={SearchLg}
            size="sm"
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-medium text-tertiary">Status:</span>
          {(['all', 'active', 'suspended'] as const).map((filter) => (
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

      {/* Bulk Actions Floating Notification Bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 bg-secondary p-3 rounded-xl border border-brand ring-2 ring-brand/20 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-brand-solid text-xs font-bold text-white">
              {selectedIds.length}
            </span>
            <span className="text-sm font-semibold text-primary">
              Tenants Selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              color="secondary"
              onPress={handleBulkActivate}
            >
              Bulk Activate
            </Button>
            <Button
              size="sm"
              color="secondary"
              onPress={handleBulkSuspend}
            >
              Bulk Suspend
            </Button>
            <Button
              size="sm"
              color="secondary"
              className="text-error-primary hover:text-error-solid"
              onPress={handleBulkDelete}
            >
              Bulk Delete
            </Button>
            <Button
              size="sm"
              color="tertiary"
              onPress={() => setSelectedIds([])}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Tenants Table */}
      <TableCard.Root>
        <TableCard.Header
          title="Tenant Organizations"
          badge={`${filteredTenants.length} Found`}
          description="Isolated PostgreSQL database schemas, operational routers, and domain routing"
        />
        <Table aria-label="Tenants Table">
          <Table.Header>
            <Table.Head id="select" className="w-10">
              <input
                type="checkbox"
                aria-label="Select all tenants"
                checked={isAllSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="size-4 rounded border-secondary text-brand accent-brand cursor-pointer"
              />
            </Table.Head>
            <Table.Head id="name" isRowHeader>Tenant Name</Table.Head>
            <Table.Head id="schema">Postgres Schema</Table.Head>
            <Table.Head id="domain">Access URL</Table.Head>
            <Table.Head id="plan">Current Plan</Table.Head>
            <Table.Head id="status">Status</Table.Head>
            <Table.Head id="actions">Advanced Management</Table.Head>
          </Table.Header>
          <Table.Body items={filteredTenants}>
            {(tenant) => {
              const isSelected = selectedIds.includes(tenant.id);
              return (
                <Table.Row id={tenant.id} className={isSelected ? 'bg-brand-primary_alt/20' : ''}>
                  <Table.Cell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${tenant.name}`}
                      checked={isSelected}
                      onChange={(e) => handleSelectOne(tenant.id, e.target.checked)}
                      className="size-4 rounded border-secondary text-brand accent-brand cursor-pointer"
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-lg bg-secondary flex items-center justify-center text-primary font-bold border border-secondary shrink-0">
                        <Building07 className="size-5 text-brand-solid" />
                      </div>
                      <div>
                        <div className="font-semibold text-primary">{tenant.name}</div>
                        <div className="text-xs text-tertiary">{tenant.contact_email || 'No email provided'}</div>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-xs bg-secondary px-2 py-1 rounded border border-secondary text-secondary">
                      {tenant.schema_name}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <a
                      href={`https://${tenant.domain_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-solid hover:underline"
                    >
                      {tenant.domain_url}
                      <LinkExternal01 className="size-3" />
                    </a>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="gray" size="sm">
                      {tenant.plan || 'Starter Tier'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={tenant.is_active ? 'success' : 'error'}
                      size="sm"
                    >
                      {tenant.is_active ? 'Active' : 'Suspended'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        color="primary"
                        iconLeading={Sliders01}
                        onPress={() => openManageDrawer(tenant, 'overview')}
                      >
                        Manage
                      </Button>
                      <Button
                        size="sm"
                        color="secondary"
                        iconLeading={Activity}
                        aria-label="View ISP Telemetry"
                        onPress={() => openManageDrawer(tenant, 'telemetry')}
                      >
                        Telemetry
                      </Button>
                      <Button
                        size="sm"
                        color="secondary"
                        iconLeading={LogIn01}
                        aria-label="1-Click Impersonate Session"
                        onPress={() => handleImpersonate(tenant)}
                      >
                        Login
                      </Button>
                      <Button
                        size="sm"
                        color="secondary"
                        iconLeading={Edit01}
                        aria-label="Edit Details"
                        onPress={() => openEditModal(tenant)}
                      />
                      <Button
                        size="sm"
                        color={tenant.is_active ? 'secondary' : 'primary'}
                        onPress={() => handleToggleStatus(tenant)}
                      >
                        {tenant.is_active ? 'Suspend' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        color="secondary"
                        iconLeading={Folder}
                        aria-label="Trigger Instant Backup"
                        onPress={() => handleQuickBackup(tenant)}
                      />
                      <Button
                        size="sm"
                        color="secondary"
                        iconLeading={Trash01}
                        className="text-error-primary hover:text-error-solid"
                        aria-label="Delete Tenant"
                        onPress={() => {
                          setSelectedTenant(tenant);
                          setIsDeleteOpen(true);
                        }}
                      />
                    </div>
                  </Table.Cell>
                </Table.Row>
              );
            }}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Advanced Tenant Detail Slideout Drawer */}
      <ModalOverlay isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <Modal className="max-w-3xl w-full">
          <Dialog>
            {({ close }) => (
              <div className="flex flex-col h-full bg-primary text-primary">
                {/* Drawer Header */}
                <div className="p-6 border-b border-secondary flex items-start justify-between bg-secondary/30">
                  <div className="flex items-start gap-4">
                    <div className="size-12 rounded-xl bg-brand-primary_alt flex items-center justify-center text-brand-solid shrink-0 shadow-xs border border-brand/20">
                      <Building07 className="size-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-primary">{drawerTenant?.name}</h2>
                        <Badge color={drawerTenant?.is_active ? 'success' : 'error'} size="sm">
                          {drawerTenant?.is_active ? 'Active' : 'Suspended'}
                        </Badge>
                        <Badge color="gray" size="sm">
                          {drawerTenant?.plan}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-tertiary">
                        <span className="font-mono bg-secondary px-2 py-0.5 rounded border border-secondary">
                          schema: {drawerTenant?.schema_name}
                        </span>
                        <a
                          href={`https://${drawerTenant?.domain_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-brand-solid hover:underline"
                        >
                          {drawerTenant?.domain_url}
                          <LinkExternal01 className="size-3" />
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={LogIn01}
                      onPress={() => drawerTenant && handleImpersonate(drawerTenant)}
                    >
                      Impersonate
                    </Button>
                    <CloseButton onPress={close} />
                  </div>
                </div>

                {/* Drawer Tabs Navigation */}
                <div className="flex items-center gap-1 border-b border-secondary px-6 pt-3 bg-secondary/10">
                  <button
                    onClick={() => handleDrawerTabChange('overview')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition ${
                      drawerTab === 'overview'
                        ? 'border-brand text-brand-secondary'
                        : 'border-transparent text-tertiary hover:text-primary'
                    }`}
                  >
                    <Building07 className="size-4" />
                    Overview & Schema
                  </button>
                  <button
                    onClick={() => handleDrawerTabChange('telemetry')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition ${
                      drawerTab === 'telemetry'
                        ? 'border-brand text-brand-secondary'
                        : 'border-transparent text-tertiary hover:text-primary'
                    }`}
                  >
                    <Activity className="size-4" />
                    ISP Telemetry
                  </button>
                  <button
                    onClick={() => handleDrawerTabChange('features')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition ${
                      drawerTab === 'features'
                        ? 'border-brand text-brand-secondary'
                        : 'border-transparent text-tertiary hover:text-primary'
                    }`}
                  >
                    <Sliders01 className="size-4" />
                    Feature Flags
                  </button>
                  <button
                    onClick={() => handleDrawerTabChange('admins')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition ${
                      drawerTab === 'admins'
                        ? 'border-brand text-brand-secondary'
                        : 'border-transparent text-tertiary hover:text-primary'
                    }`}
                  >
                    <Users01 className="size-4" />
                    Tenant Admins
                  </button>
                </div>

                {/* Drawer Tab Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* TAB 1: OVERVIEW */}
                  {drawerTab === 'overview' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-secondary p-4 bg-primary space-y-2">
                          <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">
                            Database Namespace
                          </span>
                          <div className="text-lg font-bold font-mono text-primary">
                            {drawerTenant?.schema_name}
                          </div>
                          <p className="text-xs text-tertiary">
                            PostgreSQL schema isolated with multi-tenant search path routing.
                          </p>
                        </div>

                        <div className="rounded-xl border border-secondary p-4 bg-primary space-y-2">
                          <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">
                            Public Routing Domain
                          </span>
                          <div className="text-lg font-bold text-primary truncate">
                            {drawerTenant?.domain_url}
                          </div>
                          <p className="text-xs text-tertiary">
                            Wildcard ingress SSL and custom CNAME support enabled.
                          </p>
                        </div>
                      </div>

                      {/* Connection info card */}
                      <div className="rounded-xl border border-secondary p-4 bg-secondary/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Server01 className="size-4 text-brand-solid" />
                            <span className="text-sm font-bold text-primary">Isolated Database Connection</span>
                          </div>
                          <Badge color="success" size="sm">
                            Pool Active
                          </Badge>
                        </div>
                        <div className="bg-primary p-3 rounded-lg border border-secondary font-mono text-xs text-secondary overflow-x-auto">
                          postgres://sheba_usr:••••••••@core-db.internal:5432/sheba_erp?search_path={drawerTenant?.schema_name},public
                        </div>
                      </div>

                      {/* Action cards */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-tertiary uppercase tracking-wider">
                          Control Actions
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <button
                            onClick={() => drawerTenant && handleQuickBackup(drawerTenant)}
                            className="flex flex-col items-start p-4 rounded-xl border border-secondary bg-primary hover:bg-secondary/50 text-left transition"
                          >
                            <Folder className="size-5 text-brand-solid mb-2" />
                            <span className="font-semibold text-sm text-primary">Take Backup</span>
                            <span className="text-xs text-tertiary mt-1">Full PostgreSQL schema dump</span>
                          </button>

                          <button
                            onClick={() => drawerTenant && handleToggleStatus(drawerTenant)}
                            className="flex flex-col items-start p-4 rounded-xl border border-secondary bg-primary hover:bg-secondary/50 text-left transition"
                          >
                            <ShieldTick className={`size-5 mb-2 ${drawerTenant?.is_active ? 'text-error-solid' : 'text-success-solid'}`} />
                            <span className="font-semibold text-sm text-primary">
                              {drawerTenant?.is_active ? 'Suspend Tenant' : 'Activate Tenant'}
                            </span>
                            <span className="text-xs text-tertiary mt-1">
                              {drawerTenant?.is_active ? 'Cut off ingress access' : 'Restore full ISP portal'}
                            </span>
                          </button>

                          <button
                            onClick={() => drawerTenant && handleImpersonate(drawerTenant)}
                            className="flex flex-col items-start p-4 rounded-xl border border-secondary bg-primary hover:bg-secondary/50 text-left transition"
                          >
                            <LogIn01 className="size-5 text-brand-solid mb-2" />
                            <span className="font-semibold text-sm text-primary">Impersonate</span>
                            <span className="text-xs text-tertiary mt-1">Login directly as tenant admin</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: TELEMETRY */}
                  {drawerTab === 'telemetry' && (
                    <div className="space-y-6">
                      {telemetryLoading ? (
                        <div className="py-12 text-center text-sm text-tertiary">
                          Querying live operational telemetry...
                        </div>
                      ) : telemetry ? (
                        <>
                          {/* Top stat metrics */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-xl border border-secondary p-4 bg-primary">
                              <span className="text-xs font-semibold text-tertiary">Total Subscribers</span>
                              <div className="text-2xl font-bold text-primary mt-1">
                                {telemetry.subscribers.total}
                              </div>
                              <span className="text-xs text-success-solid font-medium">
                                {telemetry.subscribers.active} Active Online
                              </span>
                            </div>

                            <div className="rounded-xl border border-secondary p-4 bg-primary">
                              <span className="text-xs font-semibold text-tertiary">Billing Volume</span>
                              <div className="text-2xl font-bold text-primary mt-1">
                                ৳{telemetry.subscribers.monthly_billing_volume.toLocaleString()}
                              </div>
                              <span className="text-xs text-error-solid font-medium">
                                ৳{telemetry.subscribers.total_due_amount.toLocaleString()} Due
                              </span>
                            </div>

                            <div className="rounded-xl border border-secondary p-4 bg-primary">
                              <span className="text-xs font-semibold text-tertiary">Optical ONUs</span>
                              <div className="text-2xl font-bold text-primary mt-1">
                                {telemetry.optical.onu_count ?? telemetry.optical.onus ?? 0}
                              </div>
                              <span className="text-xs text-success-solid font-medium">
                                {telemetry.optical.online_onu_count ?? 0} Online
                              </span>
                            </div>

                            <div className="rounded-xl border border-secondary p-4 bg-primary">
                              <span className="text-xs font-semibold text-tertiary">System Health</span>
                              <div className="text-2xl font-bold text-success-solid mt-1">
                                99.98%
                              </div>
                              <span className="text-xs text-tertiary">
                                24h Uptime
                              </span>
                            </div>
                          </div>

                          {/* Routers Section */}
                          <div className="rounded-xl border border-secondary p-4 bg-primary space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Server01 className="size-4 text-brand-solid" />
                                <h4 className="text-sm font-bold text-primary">Core BRAS & Edge Gateways</h4>
                              </div>
                              <Badge color="success" size="sm">
                                Online
                              </Badge>
                            </div>

                            <div className="space-y-2">
                              {(Array.isArray(telemetry.routers)
                                ? telemetry.routers
                                : telemetry.routers.devices || []
                              ).map((r: any, idx: number) => (
                                <div
                                  key={r.id || idx}
                                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-secondary text-xs"
                                >
                                  <div>
                                    <div className="font-semibold text-primary">{r.name}</div>
                                    <div className="text-tertiary font-mono">{r.ip_address || '192.168.88.1'}</div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-tertiary">
                                      CPU: <strong className="text-primary">{r.cpu_usage ?? r.cpu_load ?? 15}%</strong>
                                    </span>
                                    <Badge color={r.status === 'Online' ? 'success' : 'error'} size="sm">
                                      {r.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* POP Branches */}
                          <div className="rounded-xl border border-secondary p-4 bg-primary space-y-3">
                            <h4 className="text-sm font-bold text-primary">Network POP Branches</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {(Array.isArray(telemetry.pops)
                                ? telemetry.pops
                                : telemetry.pops.branches || []
                              ).map((p, idx) => (
                                <div
                                  key={p.id || idx}
                                  className="p-3 rounded-lg bg-secondary/30 border border-secondary text-xs space-y-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <strong className="text-primary">{p.name}</strong>
                                    <Badge color="success" size="sm">
                                      {p.status}
                                    </Badge>
                                  </div>
                                  <div className="text-tertiary">{p.location}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="py-8 text-center text-xs text-tertiary">No telemetry available</div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: FEATURE FLAGS */}
                  {drawerTab === 'features' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-primary">Module Entitlements & Feature Flags</h3>
                          <p className="text-xs text-tertiary">
                            Toggle ISP platform modules on/off for this tenant in real-time.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          color="secondary"
                          iconLeading={RefreshCw01}
                          onPress={() => drawerTenant && loadFeatures(drawerTenant.id)}
                          isDisabled={featuresLoading}
                        >
                          Reload
                        </Button>
                      </div>

                      {featureActionFeedback && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-success-primary_alt text-success-solid text-xs font-semibold animate-in fade-in duration-200">
                          <CheckCircle className="size-4 shrink-0" />
                          <span>{featureActionFeedback}</span>
                        </div>
                      )}

                      {featuresLoading ? (
                        <div className="py-12 text-center text-sm text-tertiary">
                          Loading feature flags from registry...
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {features.map((feature) => (
                            <div
                              key={feature.key}
                              className="flex items-start justify-between gap-4 p-4 rounded-xl border border-secondary bg-primary hover:bg-secondary/20 transition"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-primary">{feature.label}</span>
                                  {feature.is_exclusive && (
                                    <Badge color="brand" size="sm">
                                      Exclusive Enterprise
                                    </Badge>
                                  )}
                                  {feature.paid && !feature.is_exclusive && (
                                    <Badge color="warning" size="sm">
                                      Paid Add-On
                                    </Badge>
                                  )}
                                  <span className="font-mono text-[10px] text-tertiary bg-secondary px-1.5 py-0.5 rounded">
                                    {feature.key}
                                  </span>
                                </div>
                                <p className="text-xs text-tertiary leading-relaxed">
                                  {feature.description}
                                </p>
                              </div>

                              <div className="shrink-0 pt-1">
                                <Toggle
                                  aria-label={`Toggle ${feature.label}`}
                                  isSelected={feature.enabled}
                                  onChange={() => handleToggleFeature(feature.key, feature.enabled)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: TENANT ADMINS */}
                  {drawerTab === 'admins' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-primary">Tenant Administrators</h3>
                          <p className="text-xs text-tertiary">
                            Authorized ISP manager profiles with RBAC credentials for this organization.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          color="primary"
                          iconLeading={Plus}
                          onPress={() => setIsCreateAdminOpen(true)}
                        >
                          Provision Admin
                        </Button>
                      </div>

                      {adminsLoading ? (
                        <div className="py-12 text-center text-sm text-tertiary">
                          Loading administrator records...
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {admins.map((adm) => (
                            <div
                              key={adm.id}
                              className="flex items-center justify-between p-4 rounded-xl border border-secondary bg-primary"
                            >
                              <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-secondary flex items-center justify-center font-bold text-primary">
                                  {adm.username.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-sm text-primary">{adm.full_name || adm.username}</div>
                                  <div className="text-xs text-tertiary">{adm.email || 'No email registered'}</div>
                                  <div className="text-[11px] text-tertiary mt-0.5 font-mono">
                                    username: @{adm.username} • Last login: {adm.last_login}
                                  </div>
                                </div>
                              </div>
                              <Badge color="success" size="sm">
                                {adm.role || 'Admin'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Drawer Footer */}
                <div className="p-4 border-t border-secondary flex items-center justify-between bg-secondary/20">
                  <span className="text-xs text-tertiary">
                    Tenant ID: <strong className="font-mono text-primary">{drawerTenant?.id}</strong>
                  </span>
                  <Button color="secondary" onPress={close}>
                    Close Drawer
                  </Button>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Provision New Admin Modal */}
      <ModalOverlay isOpen={isCreateAdminOpen} onOpenChange={setIsCreateAdminOpen}>
        <Modal className="max-w-md">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleCreateAdmin} className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-brand-primary_alt text-brand-solid">
                      <Users01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Provision Tenant Admin</h2>
                      <p className="text-xs text-tertiary">Assign authoritative credentials for {drawerTenant?.name}</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-3">
                  <Input
                    label="Username"
                    placeholder="e.g. jdoe_admin"
                    value={newAdmin.username}
                    onChange={(val) => setNewAdmin({ ...newAdmin, username: val.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    isRequired
                  />
                  <Input
                    label="Full Name"
                    placeholder="e.g. John Doe"
                    value={newAdmin.full_name}
                    onChange={(val) => setNewAdmin({ ...newAdmin, full_name: val })}
                  />
                  <Input
                    label="Official Email"
                    type="email"
                    placeholder="jdoe@organization.com"
                    value={newAdmin.email}
                    onChange={(val) => setNewAdmin({ ...newAdmin, email: val })}
                    isRequired
                  />
                  <Input
                    label="Temporary Password"
                    type="password"
                    placeholder="••••••••••••"
                    value={newAdmin.password}
                    onChange={(val) => setNewAdmin({ ...newAdmin, password: val })}
                    isRequired
                  />
                  <Input
                    label="Contact Phone"
                    placeholder="+8801700000000"
                    value={newAdmin.phone}
                    onChange={(val) => setNewAdmin({ ...newAdmin, phone: val })}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Create Administrator
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* 1-Click Super-Admin Impersonation Modal */}
      <ModalOverlay isOpen={isImpersonateOpen} onOpenChange={setIsImpersonateOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-brand-primary_alt text-brand-solid">
                      <Key01 className="size-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Super-Admin Impersonation</h2>
                      <p className="text-xs text-tertiary">Ephemeral session token generated</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="p-4 rounded-xl border border-brand bg-brand-primary_alt/10 space-y-2">
                  <div className="text-xs font-semibold text-brand-secondary">
                    AUTHORIZATION CONTEXT
                  </div>
                  <div className="text-sm text-primary">
                    Impersonating user <strong className="text-brand-solid">@{impersonateData?.impersonated_user}</strong> inside tenant organization <strong className="text-primary">{impersonateData?.tenant_name}</strong>.
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-secondary">
                    Bearer Access Token
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={impersonateData?.token || ''}
                      className="w-full bg-secondary p-2.5 rounded-lg border border-secondary font-mono text-xs text-primary"
                    />
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={copiedToken ? Check : Copy01}
                      onPress={() => impersonateData?.token && copyToClipboard(impersonateData.token)}
                    >
                      {copiedToken ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Dismiss
                  </Button>
                  <Button
                    color="primary"
                    iconLeading={LogIn01}
                    onPress={() => {
                      if (impersonateData?.redirect_url) {
                        window.open(impersonateData.redirect_url, '_blank');
                      }
                      close();
                    }}
                  >
                    Launch ISP Portal
                  </Button>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Add Tenant Modal */}
      <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleCreateTenant} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <Building07 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Provision New Tenant</h2>
                      <p className="text-xs text-tertiary">Initialize a dedicated schema and routing domain.</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <Input
                    label="Organization Name"
                    placeholder="e.g. Wayne Enterprises"
                    value={formData.name}
                    onChange={handleNameChange}
                    isRequired
                  />

                  <Input
                    label="Schema Identifier"
                    placeholder="e.g. wayne_enterprises"
                    value={formData.schema_name}
                    onChange={(val) => setFormData({ ...formData, schema_name: val })}
                    hint="PostgreSQL schema namespace (alphanumeric and underscores)"
                    isRequired
                  />

                  <Input
                    label="Domain URL"
                    placeholder="e.g. wayne.sheba.app"
                    value={formData.domain_url}
                    onChange={(val) => setFormData({ ...formData, domain_url: val })}
                    isRequired
                  />

                  <Input
                    label="Administrator Email"
                    placeholder="admin@organization.com"
                    type="email"
                    value={formData.contact_email}
                    onChange={(val) => setFormData({ ...formData, contact_email: val })}
                  />

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Subscription Plan
                    </label>
                    <select
                      value={formData.plan}
                      onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="Starter Tier">Starter Tier ($49/mo)</option>
                      <option value="Professional Tier">Professional Tier ($149/mo)</option>
                      <option value="Enterprise VIP">Enterprise VIP ($399/mo)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit">
                    Create Tenant
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Edit Tenant Modal */}
      <ModalOverlay isOpen={isEditOpen} onOpenChange={setIsEditOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleUpdateTenant} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-secondary p-2 text-primary">
                      <Edit01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Edit Tenant Details</h2>
                      <p className="text-xs text-tertiary">Modify metadata for {selectedTenant?.name}</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <Input
                    label="Organization Name"
                    value={formData.name}
                    onChange={(val) => setFormData({ ...formData, name: val })}
                    isRequired
                  />

                  <Input
                    label="Domain URL"
                    value={formData.domain_url}
                    onChange={(val) => setFormData({ ...formData, domain_url: val })}
                    isRequired
                  />

                  <Input
                    label="Admin Contact Email"
                    value={formData.contact_email}
                    onChange={(val) => setFormData({ ...formData, contact_email: val })}
                  />

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Subscription Plan
                    </label>
                    <select
                      value={formData.plan}
                      onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="Starter Tier">Starter Tier ($49/mo)</option>
                      <option value="Professional Tier">Professional Tier ($149/mo)</option>
                      <option value="Enterprise VIP">Enterprise VIP ($399/mo)</option>
                    </select>
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

      {/* Delete Confirmation Modal */}
      <ModalOverlay isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Modal className="max-w-md">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-error-primary_alt p-2.5 text-error-solid">
                    <Trash01 className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-primary">Delete Tenant?</h2>
                    <p className="text-xs text-tertiary">This action cannot be undone.</p>
                  </div>
                </div>

                <p className="text-sm text-secondary">
                  Are you sure you want to delete <strong className="text-primary">{selectedTenant?.name}</strong>? All associated schema records, custom domains, and backup references will be removed from the control plane.
                </p>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    className="bg-error-solid hover:bg-error-solid/90 text-white"
                    onPress={handleDeleteTenant}
                  >
                    Delete Tenant
                  </Button>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
