import React, { useEffect, useState, useMemo } from 'react';
import {
  SearchLg,
  RefreshCw01,
  CheckCircle,
  FilterLines,
  Copy01,
  Copy02,
  Check,
  Zap,
  Sliders01,
  Building07,
  Users01,
  Globe01,
  ChevronRight,
  SwitchHorizontal01,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { FeatureMatrixResponse } from '@/api/types';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import { Avatar } from '@/components/base/avatar/avatar';

export function FeatureMatrixScreen() {
  const [matrix, setMatrix] = useState<FeatureMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);

  // Tenant Directory (Master Pane) State
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'All' | 'Enterprise VIP' | 'Professional Tier' | 'Starter Tier'>('All');
  const [overrideFilter, setOverrideFilter] = useState<'all' | 'overrides_only'>('all');

  // Tenant Console (Detail Pane) State
  const [featureSearch, setFeatureSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals State
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareTenantIds, setCompareTenantIds] = useState<string[]>([]);
  const [compareOnlyDiffs, setCompareOnlyDiffs] = useState(false);

  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string>('');
  const [isCloning, setIsCloning] = useState(false);

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const loadMatrix = async (preserveSelectedId?: string) => {
    try {
      setLoading(true);
      const data = await saasApi.getFeatureMatrix();
      setMatrix(data);

      // Maintain or pick selected tenant
      if (data.tenants.length > 0) {
        if (preserveSelectedId && data.tenants.some((t) => t.id === preserveSelectedId)) {
          setSelectedTenantId(preserveSelectedId);
        } else if (!selectedTenantId || !data.tenants.some((t) => t.id === selectedTenantId)) {
          setSelectedTenantId(data.tenants[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load feature matrix:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatrix();
  }, []);

  // Compute tenant stats (enabled count, overrides count)
  const tenantStats = useMemo(() => {
    if (!matrix) return new Map<string, { enabled: number; overrides: number }>();
    const stats = new Map<string, { enabled: number; overrides: number }>();

    matrix.tenants.forEach((tenant) => {
      let enabled = 0;
      let overrides = 0;
      matrix.rows.forEach((row) => {
        const cell = row.tenants.find((t) => t.tenant_id === tenant.id);
        if (cell) {
          if (cell.enabled) enabled++;
          if (cell.is_override) overrides++;
        }
      });
      stats.set(tenant.id, { enabled, overrides });
    });

    return stats;
  }, [matrix]);

  // Total overrides across all tenants
  const totalOverridesCount = useMemo(() => {
    let count = 0;
    tenantStats.forEach((s) => {
      count += s.overrides;
    });
    return count;
  }, [tenantStats]);

  // Filtered tenants for master directory
  const filteredTenants = useMemo(() => {
    if (!matrix) return [];
    return matrix.tenants.filter((tenant) => {
      const stats = tenantStats.get(tenant.id) || { enabled: 0, overrides: 0 };

      // Search match
      const q = tenantSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tenant.name.toLowerCase().includes(q) ||
        tenant.slug.toLowerCase().includes(q) ||
        (tenant.plan && tenant.plan.toLowerCase().includes(q)) ||
        (tenant.contact_email && tenant.contact_email.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Plan filter
      if (planFilter !== 'All' && tenant.plan !== planFilter) return false;

      // Overrides filter
      if (overrideFilter === 'overrides_only' && stats.overrides === 0) return false;

      return true;
    });
  }, [matrix, tenantStats, tenantSearch, planFilter, overrideFilter]);

  // Selected tenant object
  const currentTenant = useMemo(() => {
    if (!matrix) return null;
    return matrix.tenants.find((t) => t.id === selectedTenantId) || matrix.tenants[0] || null;
  }, [matrix, selectedTenantId]);

  // Current tenant's features
  const tenantFeatures = useMemo(() => {
    if (!matrix || !currentTenant) return [];

    return matrix.rows.map((row) => {
      const cell = row.tenants.find((t) => t.tenant_id === currentTenant.id);
      const isEnterprise = currentTenant.plan === 'Enterprise VIP';
      const baselineDefault = isEnterprise && row.category === 'Exclusive' ? true : row.default_enabled;

      return {
        feature_key: row.feature_key,
        label: row.label,
        description: row.description,
        category: row.category,
        paid: row.paid,
        default_enabled: baselineDefault,
        enabled: cell ? cell.enabled : baselineDefault,
        is_override: cell ? cell.is_override : false,
      };
    });
  }, [matrix, currentTenant]);

  // Filtered features for detail console
  const filteredFeatures = useMemo(() => {
    return tenantFeatures.filter((feat) => {
      const q = featureSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        feat.label.toLowerCase().includes(q) ||
        feat.feature_key.toLowerCase().includes(q) ||
        feat.description.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (categoryFilter !== 'All' && feat.category !== categoryFilter) return false;

      return true;
    });
  }, [tenantFeatures, featureSearch, categoryFilter]);

  // Categories list with count for current tenant
  const categories = useMemo(() => {
    const cats = ['All', 'Billing', 'Network', 'Communications', 'Customer', 'Exclusive'];
    return cats.map((cat) => {
      const count =
        cat === 'All'
          ? tenantFeatures.length
          : tenantFeatures.filter((f) => f.category === cat).length;
      return { name: cat, count };
    });
  }, [tenantFeatures]);

  // Toggle single feature for current tenant
  const handleToggleFeature = async (featureKey: string, currentEnabled: boolean, featureLabel: string) => {
    if (!currentTenant || !matrix) return;
    const newEnabled = !currentEnabled;

    // Optimistic update
    setMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => {
        if (row.feature_key !== featureKey) return row;
        return {
          ...row,
          tenants: row.tenants.map((t) => {
            if (t.tenant_id !== currentTenant.id) return t;
            return { ...t, enabled: newEnabled, is_override: true };
          }),
        };
      }),
    });

    try {
      await saasApi.setFeatureFlag(currentTenant.id, featureKey, newEnabled);
      showNotification(`"${featureLabel}" ${newEnabled ? 'enabled' : 'disabled'} for ${currentTenant.name}.`);
    } catch (err) {
      console.error('Failed to toggle feature flag:', err);
      loadMatrix(currentTenant.id);
    }
  };

  // Reset single feature override back to default
  const handleResetSingleFeature = async (featureKey: string, defaultVal: boolean, featureLabel: string) => {
    if (!currentTenant || !matrix) return;

    // Optimistic update
    setMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => {
        if (row.feature_key !== featureKey) return row;
        return {
          ...row,
          tenants: row.tenants.map((t) => {
            if (t.tenant_id !== currentTenant.id) return t;
            return { ...t, enabled: defaultVal, is_override: false };
          }),
        };
      }),
    });

    try {
      await saasApi.setFeatureFlag(currentTenant.id, featureKey, defaultVal);
      showNotification(`"${featureLabel}" reset to plan default (${defaultVal ? 'ON' : 'OFF'}).`);
    } catch (err) {
      console.error('Failed to reset feature flag:', err);
      loadMatrix(currentTenant.id);
    }
  };

  // Batch toggle features in current category for current tenant
  const handleBatchCategoryToggle = async (enable: boolean) => {
    if (!currentTenant || !matrix) return;
    const targets = filteredFeatures;
    if (targets.length === 0) return;

    const updates = targets.map((t) => ({ feature_key: t.feature_key, enabled: enable }));

    // Optimistic
    setMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => {
        const match = updates.find((u) => u.feature_key === row.feature_key);
        if (!match) return row;
        return {
          ...row,
          tenants: row.tenants.map((t) => {
            if (t.tenant_id !== currentTenant.id) return t;
            return { ...t, enabled: enable, is_override: true };
          }),
        };
      }),
    });

    try {
      await saasApi.bulkSetFeatureFlags(currentTenant.id, updates);
      showNotification(`${enable ? 'Enabled' : 'Disabled'} ${targets.length} features in ${categoryFilter} for ${currentTenant.name}.`);
    } catch (err) {
      console.error('Batch toggle failed:', err);
      loadMatrix(currentTenant.id);
    }
  };

  // Reset all overrides for current tenant
  const handleResetAllOverrides = async () => {
    if (!currentTenant) return;
    try {
      setIsResetting(true);
      await saasApi.resetTenantFeatures(currentTenant.id);
      showNotification(`All custom overrides reset to baseline plan defaults for ${currentTenant.name}.`);
      setIsResetConfirmOpen(false);
      await loadMatrix(currentTenant.id);
    } catch (err) {
      console.error('Failed to reset tenant overrides:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Clone entitlements from another tenant
  const handleCloneEntitlements = async () => {
    if (!currentTenant || !cloneSourceId) return;
    try {
      setIsCloning(true);
      await saasApi.cloneTenantFeatures(cloneSourceId, currentTenant.id);
      const source = matrix?.tenants.find((t) => t.id === cloneSourceId);
      showNotification(`Successfully cloned all feature flags from "${source?.name}" to "${currentTenant.name}".`);
      setIsCloneOpen(false);
      await loadMatrix(currentTenant.id);
    } catch (err) {
      console.error('Clone failed:', err);
    } finally {
      setIsCloning(false);
    }
  };


  // Copy feature key to clipboard
  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Open compare modal with 2-3 initial tenants
  const handleOpenCompare = () => {
    if (!matrix || matrix.tenants.length === 0) return;
    const initial = [
      selectedTenantId || matrix.tenants[0].id,
      matrix.tenants[1]?.id,
      matrix.tenants[2]?.id,
    ].filter(Boolean) as string[];
    setCompareTenantIds(initial);
    setIsCompareOpen(true);
  };

  const getPlanBadgeColor = (plan?: string): 'gray' | 'warning' | 'blue' => {
    if (!plan) return 'gray';
    if (plan.includes('Enterprise')) return 'warning';
    if (plan.includes('Professional')) return 'blue';
    return 'gray';
  };

  const currentStats = currentTenant ? tenantStats.get(currentTenant.id) || { enabled: 0, overrides: 0 } : { enabled: 0, overrides: 0 };
  const totalFeatureCount = matrix?.rows.length || 13;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Tenant Entitlements Console</h1>
            <Badge color="brand" size="sm">
              Modular Control Plane
            </Badge>
            <Badge color="gray" size="sm">
              {matrix?.tenants.length || 0} Total Tenants
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            High-efficiency entitlement management. Inspect, override, or clone modular feature flags for any individual ISP tenant at scale.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">

          <Button
            color="secondary"
            size="sm"
            iconLeading={SwitchHorizontal01}
            onPress={handleOpenCompare}
            isDisabled={loading || !matrix || matrix.tenants.length < 2}
          >
            Compare Tenants
          </Button>

          <Button
            color="secondary"
            size="sm"
            iconLeading={RefreshCw01}
            onPress={() => loadMatrix(selectedTenantId)}
            isDisabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {notification && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-success-primary_alt text-success-solid text-sm font-semibold border border-success-solid/20 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle className="size-5 shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Two-Column Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT MASTER PANE: Scalable Tenant Directory */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-4">
          <div className="bg-primary rounded-xl border border-secondary shadow-xs overflow-hidden flex flex-col">
            {/* Master Header */}
            <div className="p-4 border-b border-secondary space-y-3 bg-primary">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building07 className="size-4 text-tertiary" />
                  <span className="font-semibold text-sm text-primary">ISP Tenants Directory</span>
                </div>
                <Badge color="gray" size="sm">
                  {filteredTenants.length} of {matrix?.tenants.length || 0}
                </Badge>
              </div>

              {/* Fast Search Input */}
              <Input
                aria-label="Search tenants"
                placeholder="Search by name, @slug, plan..."
                icon={SearchLg}
                size="sm"
                value={tenantSearch}
                onChange={(val) => setTenantSearch(val)}
              />

              {/* Segmented Pill Tabs for Plans */}
              <div className="flex p-1 bg-secondary/60 rounded-xl gap-1 border border-secondary/40">
                {[
                  { id: 'All', label: 'All Plans' },
                  { id: 'Enterprise VIP', label: 'Enterprise' },
                  { id: 'Professional Tier', label: 'Pro' },
                  { id: 'Starter Tier', label: 'Starter' },
                ].map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setPlanFilter(plan.id as any)}
                    className={`flex-1 py-1 px-1.5 rounded-lg text-xs font-semibold transition text-center truncate ${
                      planFilter === plan.id
                        ? 'bg-primary text-primary shadow-xs font-bold'
                        : 'text-tertiary hover:text-primary hover:bg-secondary/40'
                    }`}
                  >
                    {plan.label}
                  </button>
                ))}
              </div>

              {/* Quick Filter Toggle for Overrides */}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-xs text-tertiary font-medium">Filter Overrides:</span>
                <button
                  onClick={() => setOverrideFilter((prev) => (prev === 'all' ? 'overrides_only' : 'all'))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    overrideFilter === 'overrides_only'
                      ? 'bg-warning-primary_alt text-warning-solid font-bold ring-1 ring-warning'
                      : 'bg-secondary/60 text-tertiary hover:text-primary'
                  }`}
                >
                  <Zap className="size-3" />
                  <span>Has Overrides</span>
                  {totalOverridesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-warning-solid text-white font-bold">
                      {totalOverridesCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Scrollable Tenant Cards List with sleek scrollbar */}
            <div className="divide-y divide-secondary overflow-y-auto max-h-[calc(100vh-280px)] min-h-[460px] [scrollbar-width:thin] [scrollbar-color:var(--color-border-secondary)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-secondary hover:[&::-webkit-scrollbar-thumb]:bg-tertiary [&::-webkit-scrollbar-track]:bg-transparent">
              {filteredTenants.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-2">
                  <Users01 className="size-8 mx-auto text-tertiary opacity-60" />
                  <p className="text-sm font-semibold text-primary">No tenants found</p>
                  <p className="text-xs text-tertiary">Try clearing your search query or filters.</p>
                  <button
                    onClick={() => {
                      setTenantSearch('');
                      setPlanFilter('All');
                      setOverrideFilter('all');
                    }}
                    className="text-xs font-semibold text-brand-secondary hover:underline pt-1"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : (
                filteredTenants.map((tenant) => {
                  const isSelected = tenant.id === selectedTenantId;
                  const stats = tenantStats.get(tenant.id) || { enabled: 0, overrides: 0 };
                  const initials = tenant.name
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase();

                  return (
                    <div
                      key={tenant.id}
                      onClick={() => setSelectedTenantId(tenant.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedTenantId(tenant.id);
                      }}
                      className={`w-full text-left p-3.5 px-4 transition cursor-pointer relative group border-l-[3px] ${
                        isSelected
                          ? 'bg-secondary/70 border-l-brand-solid'
                          : 'hover:bg-secondary/30 border-l-transparent bg-primary'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar
                            initials={initials}
                            size="sm"
                            status={tenant.is_active !== false ? 'online' : 'offline'}
                            className="shrink-0"
                          />
                          <div className="min-w-0">
                            <h3 className={`text-sm font-semibold truncate leading-tight ${isSelected ? 'text-primary font-bold' : 'text-primary'}`}>
                              {tenant.name}
                            </h3>
                            <span className="font-mono text-xs text-tertiary block mt-0.5">@{tenant.slug}</span>
                          </div>
                        </div>

                        <Badge color={getPlanBadgeColor(tenant.plan)} size="sm" className="shrink-0 text-[10px]">
                          {tenant.plan ? tenant.plan.replace(' Tier', '').replace(' VIP', '') : 'Standard'}
                        </Badge>
                      </div>

                      {/* Bottom Entitlement Metric Pills */}
                      <div className="mt-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-tertiary font-medium">
                            {stats.enabled} of {totalFeatureCount} active
                          </span>
                          {stats.overrides > 0 && (
                            <Badge color="purple" size="sm">
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <Zap className="size-2.5" />
                                {stats.overrides} custom
                              </span>
                            </Badge>
                          )}
                        </div>
                        <ChevronRight className={`size-4 transition ${isSelected ? 'text-brand-solid translate-x-0.5' : 'text-tertiary group-hover:text-secondary group-hover:translate-x-0.5'}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT DETAIL PANE: Selected Tenant Entitlement Console */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-6">
          {currentTenant ? (
            <>
              {/* Tenant Hero Profile Card */}
              <div className="bg-primary rounded-xl border border-secondary shadow-xs p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-secondary pb-5">
                  <div className="flex items-start gap-4">
                    <Avatar
                      initials={currentTenant.name
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')
                        .toUpperCase()}
                      size="lg"
                      status={currentTenant.is_active !== false ? 'online' : 'offline'}
                    />
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-xl font-bold text-primary">{currentTenant.name}</h2>
                        <Badge color={getPlanBadgeColor(currentTenant.plan)} size="md">
                          {currentTenant.plan || 'Professional Tier'}
                        </Badge>
                        <Badge color={currentTenant.is_active !== false ? 'success' : 'gray'} size="sm">
                          {currentTenant.is_active !== false ? 'Active Production' : 'Suspended'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 text-xs text-tertiary flex-wrap">
                        <span className="font-mono text-secondary">@{currentTenant.slug}</span>
                        {currentTenant.domain_url && (
                          <span className="inline-flex items-center gap-1 hover:text-brand-secondary">
                            <Globe01 className="size-3.5" />
                            {currentTenant.domain_url}
                          </span>
                        )}
                        {currentTenant.contact_email && (
                          <span>{currentTenant.contact_email}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tenant Power Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      color="secondary"
                      size="sm"
                      iconLeading={Copy01}
                      onPress={() => setIsCloneOpen(true)}
                    >
                      Clone From...
                    </Button>

                    <Button
                      color="secondary"
                      size="sm"
                      iconLeading={RefreshCw01}
                      onPress={() => setIsResetConfirmOpen(true)}
                      isDisabled={currentStats.overrides === 0}
                    >
                      Reset Defaults
                    </Button>
                  </div>
                </div>

                {/* 3 Metric Summary Chips */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-secondary/30 border border-secondary flex flex-col justify-between">
                    <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">Active Capabilities</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary">
                        {currentStats.enabled}
                        <span className="text-sm font-normal text-tertiary"> / {totalFeatureCount}</span>
                      </span>
                      <span className="text-xs font-semibold text-brand-secondary">
                        {Math.round((currentStats.enabled / totalFeatureCount) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-secondary/30 border border-secondary flex flex-col justify-between">
                    <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">Custom Overrides</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary">{currentStats.overrides}</span>
                      <span className="text-xs text-tertiary">
                        {currentStats.overrides > 0 ? 'Diverges from baseline' : 'Standard baseline'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-secondary/30 border border-secondary flex flex-col justify-between">
                    <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">Baseline Template</span>
                    <div className="mt-1 flex items-baseline gap-1.5 truncate">
                      <span className="text-base font-bold text-primary truncate">
                        {currentTenant.plan || 'Professional'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature Filter & Category Toolbar */}
              <div className="bg-primary rounded-xl border border-secondary shadow-xs p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="w-full md:w-80">
                    <Input
                      aria-label="Search feature flags"
                      placeholder="Search features by name, key, or tag..."
                      icon={SearchLg}
                      size="sm"
                      value={featureSearch}
                      onChange={(val) => setFeatureSearch(val)}
                    />
                  </div>

                  {/* Batch toggle for filtered category */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium text-tertiary">Category Batch:</span>
                    <Button
                      color="secondary"
                      size="xs"
                      onPress={() => handleBatchCategoryToggle(true)}
                    >
                      Enable All
                    </Button>
                    <Button
                      color="secondary"
                      size="xs"
                      onPress={() => handleBatchCategoryToggle(false)}
                    >
                      Disable All
                    </Button>
                  </div>
                </div>

                {/* Category Pills with Segmented Style */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 [scrollbar-width:none]">
                  <FilterLines className="size-3.5 text-tertiary shrink-0" />
                  <span className="text-xs font-semibold text-tertiary shrink-0">Category:</span>
                  {categories.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => setCategoryFilter(cat.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                        categoryFilter === cat.name
                          ? 'bg-secondary text-primary font-bold shadow-xs'
                          : 'text-tertiary hover:bg-secondary/40 hover:text-primary'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        categoryFilter === cat.name ? 'bg-primary text-secondary shadow-xs' : 'bg-secondary text-tertiary'
                      }`}>
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Categorized Features List */}
              <div className="space-y-3">
                {filteredFeatures.length === 0 ? (
                  <div className="bg-primary rounded-xl border border-secondary p-12 text-center space-y-3">
                    <Sliders01 className="size-8 mx-auto text-tertiary opacity-50" />
                    <h3 className="text-base font-bold text-primary">No features match your query</h3>
                    <p className="text-xs text-tertiary">Clear the search bar or pick another category.</p>
                  </div>
                ) : (
                  filteredFeatures.map((feat) => {
                    return (
                      <div
                        key={feat.feature_key}
                        className={`bg-primary rounded-xl border p-4 sm:p-5 transition shadow-xs hover:border-secondary_hover ${
                          feat.is_override
                            ? 'border-purple-200/80 bg-utility-purple-50/20'
                            : 'border-secondary'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          {/* Feature info */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base font-bold text-primary">{feat.label}</h4>

                              <Badge color="gray" size="sm">
                                {feat.category}
                              </Badge>

                              {feat.paid && (
                                <Badge color="warning" size="sm">
                                  Paid Add-on
                                </Badge>
                              )}

                              {feat.category === 'Exclusive' && (
                                <Badge color="purple" size="sm">
                                  Enterprise Exclusive
                                </Badge>
                              )}
                            </div>

                            {/* Technical Key + Copy Button */}
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-tertiary bg-secondary/50 px-2 py-0.5 rounded border border-secondary">
                                {feat.feature_key}
                              </span>
                              <button
                                onClick={() => handleCopyKey(feat.feature_key)}
                                className="text-tertiary hover:text-secondary p-1 transition"
                                title="Copy technical key"
                              >
                                {copiedKey === feat.feature_key ? (
                                  <Check className="size-3.5 text-success-solid" />
                                ) : (
                                  <Copy02 className="size-3.5" />
                                )}
                              </button>
                            </div>

                            <p className="text-xs text-tertiary leading-relaxed pt-1">
                              {feat.description}
                            </p>
                          </div>

                          {/* Toggle & Status Switch */}
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-secondary/40">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-secondary">
                                {feat.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                              <Toggle
                                aria-label={`Toggle ${feat.label} for ${currentTenant.name}`}
                                isSelected={feat.enabled}
                                onChange={() =>
                                  handleToggleFeature(feat.feature_key, feat.enabled, feat.label)
                                }
                              />
                            </div>

                            {/* Override status indicator badge & reset button */}
                            {feat.is_override ? (
                              <div className="flex items-center gap-2">
                                <Badge color="purple" size="sm">
                                  <span className="inline-flex items-center gap-1 font-semibold">
                                    <Zap className="size-2.5" />
                                    Custom Override
                                  </span>
                                </Badge>
                                <button
                                  onClick={() =>
                                    handleResetSingleFeature(
                                      feat.feature_key,
                                      feat.default_enabled,
                                      feat.label
                                    )
                                  }
                                  className="text-xs font-semibold text-brand-secondary hover:underline transition"
                                  title="Revert back to baseline plan default"
                                >
                                  Reset
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-tertiary">
                                Plan Baseline ({feat.default_enabled ? 'ON' : 'OFF'})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="bg-primary rounded-xl border border-secondary p-16 text-center space-y-3">
              <Building07 className="size-10 mx-auto text-tertiary opacity-40" />
              <h3 className="text-lg font-bold text-primary">No tenant selected</h3>
              <p className="text-sm text-tertiary">Select a tenant from the left directory to manage entitlements.</p>
            </div>
          )}
        </div>
      </div>

      {/* CLONE ENTITLEMENTS MODAL */}
      <ModalOverlay isOpen={isCloneOpen} onOpenChange={setIsCloneOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => {
              const otherTenants = matrix?.tenants.filter((t) => t.id !== currentTenant?.id) || [];
              const sourceTenant = matrix?.tenants.find((t) => t.id === cloneSourceId);
              const sourceStats = sourceTenant ? tenantStats.get(sourceTenant.id) : null;

              return (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-secondary pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-brand-primary_alt p-2.5 text-brand-solid">
                        <Copy01 className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-primary">Clone Tenant Entitlements</h2>
                        <p className="text-xs text-tertiary">Copy all feature flag configurations from a template tenant.</p>
                      </div>
                    </div>
                    <CloseButton onPress={close} />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="block text-xs font-semibold text-secondary mb-1">
                        Target Tenant (Receiver)
                      </span>
                      <div className="p-3 rounded-xl bg-secondary/40 border border-secondary text-sm font-semibold text-primary">
                        {currentTenant?.name} <span className="font-mono text-xs text-tertiary">(@{currentTenant?.slug})</span>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="clone-source-select" className="block text-xs font-semibold text-secondary mb-1">
                        Select Source Tenant (Template)
                      </label>
                      <select
                        id="clone-source-select"
                        value={cloneSourceId}
                        onChange={(e) => setCloneSourceId(e.target.value)}
                        className="w-full rounded-xl border border-secondary bg-primary px-3.5 py-2.5 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand-solid"
                      >
                        <option value="">-- Choose template tenant --</option>
                        {otherTenants.map((t) => {
                          const s = tenantStats.get(t.id);
                          return (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.plan || 'Standard'} • {s?.enabled || 0}/{totalFeatureCount} features)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {sourceTenant && sourceStats && (
                      <div className="p-4 rounded-xl bg-brand-primary_alt/30 border border-brand-solid/30 text-xs space-y-1.5">
                        <span className="font-bold text-brand-secondary">Clone Summary:</span>
                        <p className="text-secondary">
                          Will copy all <strong>{totalFeatureCount} feature flags</strong> from <strong>{sourceTenant.name}</strong> ({sourceStats.enabled} active capabilities).
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-secondary pt-4">
                    <Button color="secondary" size="md" onPress={close}>
                      Cancel
                    </Button>
                    <Button
                      color="primary"
                      size="md"
                      isDisabled={!cloneSourceId || isCloning}
                      onPress={handleCloneEntitlements}
                    >
                      {isCloning ? 'Cloning...' : 'Apply Clone'}
                    </Button>
                  </div>
                </div>
              );
            }}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* RESET OVERRIDES CONFIRMATION MODAL */}
      <ModalOverlay isOpen={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <Modal className="max-w-md">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-warning-primary_alt p-2.5 text-warning-solid">
                    <RefreshCw01 className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-primary">Reset Overrides to Baseline?</h2>
                    <p className="text-xs text-tertiary">Restore default entitlement package.</p>
                  </div>
                </div>

                <p className="text-sm text-secondary">
                  This will remove all <strong>{currentStats.overrides} custom overrides</strong> on <strong>{currentTenant?.name}</strong> and revert all features back to the standard <strong>{currentTenant?.plan}</strong> defaults.
                </p>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-secondary">
                  <Button color="secondary" size="md" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    size="md"
                    isDisabled={isResetting}
                    onPress={handleResetAllOverrides}
                  >
                    {isResetting ? 'Resetting...' : 'Confirm Reset'}
                  </Button>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* TARGETED SIDE-BY-SIDE COMPARISON MODAL */}
      <ModalOverlay isOpen={isCompareOpen} onOpenChange={setIsCompareOpen}>
        <Modal className="max-w-5xl">
          <Dialog>
            {({ close }) => {
              const compareTenants = (matrix?.tenants || []).filter((t) =>
                compareTenantIds.includes(t.id)
              );

              // Filter rows if diffs only
              const rowsToShow = (matrix?.rows || []).filter((row) => {
                if (!compareOnlyDiffs) return true;
                const states = compareTenants.map((t) => {
                  const cell = row.tenants.find((c) => c.tenant_id === t.id);
                  return cell ? cell.enabled : row.default_enabled;
                });
                // Check if not all states are identical
                return states.some((s) => s !== states[0]);
              });

              return (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-secondary pb-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-brand-primary_alt p-2.5 text-brand-solid">
                        <SwitchHorizontal01 className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-primary">Compare Tenant Entitlements</h2>
                        <p className="text-xs text-tertiary">
                          Side-by-side comparison for selected tenants (max 4) without horizontal sprawl.
                        </p>
                      </div>
                    </div>
                    <CloseButton onPress={close} />
                  </div>

                  {/* Tenant picker chips */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-secondary">
                      Select 2 to 4 tenants to compare:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(matrix?.tenants || []).map((t) => {
                        const isChecked = compareTenantIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              if (isChecked) {
                                if (compareTenantIds.length > 2) {
                                  setCompareTenantIds(compareTenantIds.filter((id) => id !== t.id));
                                } else {
                                  showNotification('At least 2 tenants required for comparison.', 'info');
                                }
                              } else {
                                if (compareTenantIds.length < 4) {
                                  setCompareTenantIds([...compareTenantIds, t.id]);
                                } else {
                                  showNotification('Maximum 4 tenants can be compared side-by-side.', 'info');
                                }
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                              isChecked
                                ? 'bg-secondary text-primary font-bold border-secondary shadow-xs'
                                : 'bg-primary text-secondary border-secondary hover:bg-secondary/40'
                            }`}
                          >
                            {isChecked ? '✓ ' : '+ '} {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Only differences filter toggle */}
                  <div className="flex items-center justify-between py-2 border-y border-secondary">
                    <label className="flex items-center gap-2 text-xs font-semibold text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={compareOnlyDiffs}
                        onChange={(e) => setCompareOnlyDiffs(e.target.checked)}
                        className="rounded border-secondary text-brand-solid focus:ring-brand-solid size-4"
                      />
                      <span>Show only features with differences between selected tenants</span>
                    </label>
                    <span className="text-xs text-tertiary">
                      Showing {rowsToShow.length} of {matrix?.rows.length || 0} features
                    </span>
                  </div>

                  {/* Comparison Table */}
                  <div className="overflow-x-auto max-h-[500px] rounded-xl border border-secondary [scrollbar-width:thin]">
                    <table className="w-full text-left text-xs divide-y divide-secondary">
                      <thead className="bg-secondary/40 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                          <th className="p-3 font-bold text-primary min-w-[200px]">Feature</th>
                          <th className="p-3 font-bold text-primary w-28">Category</th>
                          {compareTenants.map((t) => (
                            <th key={t.id} className="p-3 font-bold text-center min-w-[140px]">
                              <div className="truncate max-w-[130px] font-bold text-primary mx-auto">
                                {t.name}
                              </div>
                              <span className="text-[10px] font-mono text-tertiary">@{t.slug}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-secondary bg-primary">
                        {rowsToShow.map((row) => (
                          <tr key={row.feature_key} className="hover:bg-secondary/20">
                            <td className="p-3">
                              <span className="font-semibold text-primary">{row.label}</span>
                              <div className="font-mono text-[10px] text-tertiary">{row.feature_key}</div>
                            </td>
                            <td className="p-3">
                              <Badge color="gray" size="sm">
                                {row.category}
                              </Badge>
                            </td>
                            {compareTenants.map((t) => {
                              const cell = row.tenants.find((c) => c.tenant_id === t.id);
                              const isEnabled = cell ? cell.enabled : row.default_enabled;
                              const isOverride = cell ? cell.is_override : false;

                              return (
                                <td key={t.id} className="p-3 text-center">
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <Toggle
                                      aria-label={`Toggle ${row.label} for ${t.name}`}
                                      isSelected={isEnabled}
                                      onChange={() =>
                                        handleToggleFeature(row.feature_key, isEnabled, row.label)
                                      }
                                    />
                                    {isOverride && (
                                      <Badge color="purple" size="sm">
                                        override
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-secondary">
                    <Button color="secondary" size="md" onPress={close}>
                      Close Comparison
                    </Button>
                  </div>
                </div>
              );
            }}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
