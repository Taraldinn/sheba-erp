'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { SaaSClient } from '@/lib/saas-api';
import {
  SaaSTenant,
  SaaSTenantCreatePayload,
  SaaSDomain,
  TenantOnboardingRequest,
  SaaSPackage,
  TenantSubscription,
  SaaSPayment,
  DatabaseBackup,
  SaaSUser,
  SaaSUserDirectory,
  SaaSAuditLog,
  SaaSOverviewMetrics,
  SaaSApiCredential,
} from '@/lib/saas-types';
import {
  SaaSDashboardOverview,
  SaaSTenantsList,
  SaaSTenantDetailModal,
  SaaSTenantFormModal,
  SaaSDomainsManagement,
  SaaSRequestsManagement,
  SaaSPackagesManagement,
  SaaSSubscriptionsManagement,
  SaaSPaymentsLedger,
  SaaSBackupsManagement,
  SaaSUsersManagement,
  SaaSAuditLogsViewer,
  SaaSWireGuardManagement,
  SaaSApiCredentialsManagement,
} from '@/components/saas';

function SaaSAdminContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeTab = searchParams.get('tab') || 'overview';
  const actionFromUrl = searchParams.get('action');

  // Core Data States
  const [overview, setOverview] = useState<SaaSOverviewMetrics | null>(null);
  const [tenants, setTenants] = useState<SaaSTenant[]>([]);
  const [apiCredentials, setApiCredentials] = useState<SaaSApiCredential[]>([]);
  const [domains, setDomains] = useState<SaaSDomain[]>([]);
  const [requests, setRequests] = useState<TenantOnboardingRequest[]>([]);
  const [packages, setPackages] = useState<SaaSPackage[]>([]);
  const [subscriptions, setSubscriptions] = useState<TenantSubscription[]>([]);
  const [payments, setPayments] = useState<SaaSPayment[]>([]);
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [userDirectory, setUserDirectory] = useState<SaaSUserDirectory | null>(null);
  const [auditLogs, setAuditLogs] = useState<SaaSAuditLog[]>([]);

  // Page States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Tenant Modals State
  const [selectedTenantDetail, setSelectedTenantDetail] = useState<SaaSTenant | null>(null);
  const [isTenantFormOpen, setIsTenantFormOpen] = useState<boolean>(actionFromUrl === 'onboard');
  const [tenantToEdit, setTenantToEdit] = useState<SaaSTenant | null>(null);
  const [isFormSubmitting, setIsFormSubmitting] = useState<boolean>(false);

  const setTab = useCallback(
    (tab: string) => {
      setOperationError(null);
      router.push(`/?tab=${tab}`);
    },
    [router]
  );

  // Load active tab data
  const loadTabData = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);
    setOperationError(null);
    try {
      const getTenantsCached = () =>
        tenants.length > 0 ? Promise.resolve(tenants) : SaaSClient.getTenants().catch(() => []);

      if (activeTab === 'overview') {
        const [ov, tn] = await Promise.all([
          SaaSClient.getOverview().catch(() => null),
          getTenantsCached(),
        ]);
        if (ov) setOverview(ov);
        setTenants(tn);
      } else if (activeTab === 'tenants') {
        const tn = await SaaSClient.getTenants();
        setTenants(tn);
      } else if (activeTab === 'api-credentials') {
        const [creds, tn] = await Promise.all([
          SaaSClient.getApiCredentials(),
          getTenantsCached(),
        ]);
        setApiCredentials(creds);
        setTenants(tn);
      } else if (activeTab === 'domains') {
        const [dm, tn] = await Promise.all([
          SaaSClient.getDomains(),
          getTenantsCached(),
        ]);
        setDomains(dm);
        setTenants(tn);
      } else if (activeTab === 'requests') {
        const rq = await SaaSClient.getRequests();
        setRequests(rq);
      } else if (activeTab === 'packages') {
        const pk = await SaaSClient.getPackages();
        setPackages(pk);
      } else if (activeTab === 'subscriptions') {
        const [sb, tn, pk] = await Promise.all([
          SaaSClient.getSubscriptions(),
          getTenantsCached(),
          SaaSClient.getPackages().catch(() => []),
        ]);
        setSubscriptions(sb);
        setTenants(tn);
        setPackages(pk);
      } else if (activeTab === 'payments') {
        const [pm, tn] = await Promise.all([
          SaaSClient.getPayments(),
          getTenantsCached(),
        ]);
        setPayments(pm);
        setTenants(tn);
      } else if (activeTab === 'backups' || activeTab === 'export') {
        const [bk, tn] = await Promise.all([
          SaaSClient.getBackups(),
          getTenantsCached(),
        ]);
        setBackups(bk);
        setTenants(tn);
      } else if (activeTab === 'users' || activeTab === 'tenant-owners') {
        const [ud, tn] = await Promise.all([
          SaaSClient.getUsers(),
          getTenantsCached(),
        ]);
        setUserDirectory(ud);
        setTenants(tn);
      } else if (activeTab === 'audit') {
        const al = await SaaSClient.getAuditLogs();
        setAuditLogs(al);
      } else if (activeTab === 'wireguard') {
        const getTenantsCached = () =>
          tenants.length > 0 ? Promise.resolve(tenants) : SaaSClient.getTenants().catch(() => []);
        await getTenantsCached();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve control plane data.';
      setPageError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTabData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadTabData]);

  // ════════════════════════ TENANT HANDLERS ════════════════════════
  const handleTenantFormSubmit = async (payload: SaaSTenantCreatePayload) => {
    setIsFormSubmitting(true);
    try {
      if (tenantToEdit) {
        const updated = await SaaSClient.updateTenant(tenantToEdit.id, payload);
        setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        if (selectedTenantDetail?.id === updated.id) {
          setSelectedTenantDetail(updated);
        }
      } else {
        const created = await SaaSClient.createTenant(payload);
        const tenantObj = (created && (created as any).tenant && (created as any).tenant.id)
          ? (created as any).tenant
          : created;
        if (tenantObj && tenantObj.id) {
          setTenants((prev) => [tenantObj, ...prev.filter((t) => t.id !== tenantObj.id)]);
        } else {
          await loadTabData();
        }
      }
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleToggleTenantStatus = async (tenantId: string) => {
    try {
      setOperationError(null);
      const res = await SaaSClient.toggleTenantStatus(tenantId);
      setTenants((prev) =>
        prev.map((t) => (t.id === tenantId ? { ...t, is_active: res.is_active } : t))
      );
      if (selectedTenantDetail?.id === tenantId) {
        setSelectedTenantDetail((prev) => (prev ? { ...prev, is_active: res.is_active } : null));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update tenant status.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleDeleteTenant = async (tenantId: string) => {
    try {
      setOperationError(null);
      await SaaSClient.deleteTenant(tenantId);
      setTenants((prev) => prev.filter((t) => t.id !== tenantId));
      if (selectedTenantDetail?.id === tenantId) {
        setSelectedTenantDetail(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete tenant.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    // Open a placeholder window synchronously to avoid popup blocker after await
    const targetWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
    try {
      setOperationError(null);
      const res = await SaaSClient.impersonateTenant(tenantId);
      if (res.target_url) {
        if (targetWindow) {
          targetWindow.opener = null;
          targetWindow.location.href = res.target_url;
        } else {
          window.open(res.target_url, '_blank', 'noopener,noreferrer');
        }
      } else if (targetWindow) {
        targetWindow.close();
      }
    } catch (err: unknown) {
      if (targetWindow) {
        targetWindow.close();
      }
      const msg = err instanceof Error ? err.message : 'Failed to impersonate tenant.';
      setOperationError(msg);
      throw err;
    }
  };

  // ════════════════════════ DOMAIN HANDLERS ════════════════════════
  const handleCreateDomain = async (payload: {
    tenant: string;
    hostname: string;
    is_primary?: boolean;
    domain_type?: string;
  }) => {
    try {
      setOperationError(null);
      const created = await SaaSClient.createDomain(payload);
      setDomains((prev) => [created, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create domain.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleToggleDomainVerify = async (domainId: string | number) => {
    try {
      setOperationError(null);
      const res = await SaaSClient.toggleDomainVerify(domainId);
      setDomains((prev) =>
        prev.map((d) => (d.id === domainId ? { ...d, verified: res.verified } : d))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify domain.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleDeleteDomain = async (domainId: string | number) => {
    try {
      setOperationError(null);
      await SaaSClient.deleteDomain(domainId);
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete domain.';
      setOperationError(msg);
      throw err;
    }
  };

  // ════════════════════════ ONBOARDING REQUEST HANDLERS ════════════════════════
  const handleApproveRequest = async (requestId: string) => {
    try {
      setOperationError(null);
      const res = await SaaSClient.approveRequest(requestId);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r))
      );
      const tenantObj = (res && (res as any).tenant && (res as any).tenant.id)
        ? (res as any).tenant
        : null;
      if (tenantObj && tenantObj.id) {
        setTenants((prev) => [tenantObj, ...prev.filter((t) => t.id !== tenantObj.id)]);
      } else {
        await loadTabData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve request.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleRejectRequest = async (requestId: string, reason: string) => {
    try {
      setOperationError(null);
      await SaaSClient.rejectRequest(requestId, reason);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId ? { ...r, status: 'rejected', rejection_reason: reason } : r
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reject request.';
      setOperationError(msg);
      throw err;
    }
  };

  // ════════════════════════ PACKAGE HANDLERS ════════════════════════
  const handleCreatePackage = async (payload: Partial<SaaSPackage>) => {
    try {
      setOperationError(null);
      const created = await SaaSClient.createPackage(payload);
      setPackages((prev) => [...prev, created]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create package.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleUpdatePackage = async (id: string, payload: Partial<SaaSPackage>) => {
    try {
      setOperationError(null);
      const updated = await SaaSClient.updatePackage(id, payload);
      setPackages((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update package.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleDeletePackage = async (id: string) => {
    try {
      setOperationError(null);
      await SaaSClient.deletePackage(id);
      setPackages((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete package.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleTogglePackageStatus = async (id: string) => {
    try {
      setOperationError(null);
      const res = await SaaSClient.togglePackageStatus(id);
      setPackages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_active: res.is_active } : p))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update package status.';
      setOperationError(msg);
      throw err;
    }
  };

  // ════════════════════════ SUBSCRIPTION HANDLERS ════════════════════════
  const handleCreateSubscription = async (payload: Partial<TenantSubscription>) => {
    try {
      setOperationError(null);
      const created = await SaaSClient.createSubscription(payload);
      setSubscriptions((prev) => [created, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create subscription.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleRenewSubscription = async (id: string) => {
    try {
      setOperationError(null);
      const renewed = await SaaSClient.renewSubscription(id);
      setSubscriptions((prev) => prev.map((s) => (s.id === id ? renewed : s)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to renew subscription.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleCancelSubscription = async (id: string) => {
    try {
      setOperationError(null);
      const cancelled = await SaaSClient.cancelSubscription(id);
      setSubscriptions((prev) => prev.map((s) => (s.id === id ? cancelled : s)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel subscription.';
      setOperationError(msg);
      throw err;
    }
  };

  // ════════════════════════ PAYMENT HANDLERS ════════════════════════
  const handleCreatePayment = async (payload: Partial<SaaSPayment>) => {
    try {
      setOperationError(null);
      const created = await SaaSClient.createPayment(payload);
      setPayments((prev) => [created, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleDeletePayment = async (id: string) => {
    try {
      setOperationError(null);
      await SaaSClient.deletePayment(id);
      setPayments((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete payment.';
      setOperationError(msg);
      throw err;
    }
  };

  // ════════════════════════ BACKUP HANDLERS ════════════════════════
  const handleCreateBackup = async (name?: string, backup_type?: string) => {
    try {
      setOperationError(null);
      const created = await SaaSClient.createBackup(name, backup_type);
      setBackups((prev) => [created, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create backup.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleExportTenant = async (tenantId: string) => {
    try {
      setOperationError(null);
      await SaaSClient.exportTenantData(tenantId);
      loadTabData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export tenant data.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    try {
      setOperationError(null);
      await SaaSClient.restoreBackup(backupId);
      loadTabData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to restore backup.';
      setOperationError(msg);
      throw err;
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    try {
      setOperationError(null);
      await SaaSClient.deleteBackup(backupId);
      setBackups((prev) => prev.filter((b) => b.id !== backupId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete backup.';
      setOperationError(msg);
      throw err;
    }
  };

  // ════════════════════════ USER HANDLERS ════════════════════════
  const handleCreateUser = async (payload: {
    username: string;
    password: string;
    email?: string;
    role: string;
    is_superuser?: boolean;
    tenant_id?: string;
  }) => {
    await SaaSClient.createUser(payload);
    loadTabData();
  };

  const handleToggleUserStatus = async (userId: number | string) => {
    const res = await SaaSClient.toggleUserStatus(userId);
    setUserDirectory((prev) => {
      if (!prev) return prev;
      const updateList = (list: SaaSUser[]) =>
        list.map((u) => (u.id === userId ? { ...u, is_active: res.is_active } : u));
      return {
        ...prev,
        platform_admins: updateList(prev.platform_admins),
        tenant_owners: updateList(prev.tenant_owners),
      };
    });
  };

  const handleResetUserPassword = async (userId: number | string, password?: string) => {
    return await SaaSClient.resetUserPassword(userId, password);
  };

  const handleDeleteUser = async (userId: number | string) => {
    await SaaSClient.deleteUser(userId);
    setUserDirectory((prev) => {
      if (!prev) return prev;
      const filterList = (list: SaaSUser[]) => list.filter((u) => u.id !== userId);
      return {
        ...prev,
        platform_admins: filterList(prev.platform_admins),
        tenant_owners: filterList(prev.tenant_owners),
      };
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Control Plane</span>
            <span>/</span>
            <span className="text-foreground capitalize font-semibold">
              {activeTab.replace(/-/g, ' ')}
            </span>
          </div>
          <h1 className="text-xl font-black text-foreground tracking-tight">
            {activeTab === 'overview'
              ? 'SaaS Command Center'
              : activeTab === 'tenants'
              ? 'ISP Tenant Partitions'
              : activeTab === 'requests'
              ? 'Onboarding Requests Queue'
              : activeTab === 'domains'
              ? 'Domain Routing & DNS'
              : activeTab === 'packages'
              ? 'SaaS Subscription Tiers'
              : activeTab === 'subscriptions'
              ? 'Tenant Licensing Contracts'
              : activeTab === 'payments'
              ? 'Software Revenue Ledger'
              : activeTab === 'backups' || activeTab === 'export'
              ? 'Disaster Recovery & Snapshots'
              : activeTab === 'users' || activeTab === 'tenant-owners'
              ? 'Software User Directory'
              : activeTab === 'wireguard'
              ? 'WireGuard Tunnels — Central Control'
              : 'Central Security Audit Stream'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-foreground font-semibold">admin.shebafi.xyz</span>
          </div>
        </div>
      </div>

      {/* Global Load Error Alert */}
      {pageError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{pageError}</span>
          </div>
          <button
            onClick={loadTabData}
            className="underline font-semibold hover:opacity-80 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}

      {/* Mutation Operation Error Alert */}
      {operationError && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{operationError}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadTabData}
              className="underline font-semibold hover:opacity-80 transition-opacity"
            >
              Refresh
            </button>
            <button
              onClick={() => setOperationError(null)}
              className="text-muted-foreground hover:text-foreground font-semibold transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Active Tab View */}
      {activeTab === 'overview' && (
        <SaaSDashboardOverview
          overview={overview}
          isLoading={isLoading}
          onNavigateTab={setTab}
        />
      )}

      {activeTab === 'tenants' && (
        <SaaSTenantsList
          tenants={tenants}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onSelectDetail={(t) => setSelectedTenantDetail(t)}
          onAddAdmin={(t) => setSelectedTenantDetail(t)}
          onOpenCreate={() => {
            setTenantToEdit(null);
            setIsTenantFormOpen(true);
          }}
          onOpenEdit={(t) => {
            setTenantToEdit(t);
            setIsTenantFormOpen(true);
          }}
          onToggleStatus={handleToggleTenantStatus}
          onDeleteTenant={handleDeleteTenant}
          onImpersonate={handleImpersonate}
        />
      )}

      {activeTab === 'api-credentials' && (
        <SaaSApiCredentialsManagement
          credentials={apiCredentials}
          tenants={tenants}
          onRefresh={loadTabData}
          onError={setOperationError}
        />
      )}

      {activeTab === 'domains' && (
        <SaaSDomainsManagement
          domains={domains}
          tenants={tenants}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onCreateDomain={handleCreateDomain}
          onToggleVerify={handleToggleDomainVerify}
          onDeleteDomain={handleDeleteDomain}
        />
      )}

      {activeTab === 'requests' && (
        <SaaSRequestsManagement
          requests={requests}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onApprove={handleApproveRequest}
          onReject={handleRejectRequest}
        />
      )}

      {activeTab === 'packages' && (
        <SaaSPackagesManagement
          packages={packages}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onCreatePackage={handleCreatePackage}
          onUpdatePackage={handleUpdatePackage}
          onDeletePackage={handleDeletePackage}
          onToggleStatus={handleTogglePackageStatus}
        />
      )}

      {activeTab === 'subscriptions' && (
        <SaaSSubscriptionsManagement
          subscriptions={subscriptions}
          tenants={tenants}
          packages={packages}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onCreateSubscription={handleCreateSubscription}
          onRenewSubscription={handleRenewSubscription}
          onCancelSubscription={handleCancelSubscription}
        />
      )}

      {activeTab === 'payments' && (
        <SaaSPaymentsLedger
          payments={payments}
          tenants={tenants}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onCreatePayment={handleCreatePayment}
          onDeletePayment={handleDeletePayment}
        />
      )}

      {(activeTab === 'backups' || activeTab === 'export') && (
        <SaaSBackupsManagement
          backups={backups}
          tenants={tenants}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onCreateBackup={handleCreateBackup}
          onExportTenant={handleExportTenant}
          onRestoreBackup={handleRestoreBackup}
          onDeleteBackup={handleDeleteBackup}
        />
      )}

      {(activeTab === 'users' || activeTab === 'tenant-owners') && (
        <SaaSUsersManagement
          directory={userDirectory}
          tenants={tenants}
          isLoading={isLoading}
          onRefresh={loadTabData}
          onCreateUser={handleCreateUser}
          onToggleStatus={handleToggleUserStatus}
          onResetPassword={handleResetUserPassword}
          onDeleteUser={handleDeleteUser}
        />
      )}

      {activeTab === 'audit' && (
        <SaaSAuditLogsViewer
          logs={auditLogs}
          isLoading={isLoading}
          onRefresh={loadTabData}
        />
      )}

      {activeTab === 'wireguard' && (
        <SaaSWireGuardManagement
          tenants={tenants}
          onError={setOperationError}
        />
      )}

      {/* Tenant Detail Modal */}
      <SaaSTenantDetailModal
        tenant={selectedTenantDetail}
        isOpen={!!selectedTenantDetail}
        onClose={() => setSelectedTenantDetail(null)}
        onEdit={(t) => {
          setSelectedTenantDetail(null);
          setTenantToEdit(t);
          setIsTenantFormOpen(true);
        }}
        onToggleStatus={handleToggleTenantStatus}
        onImpersonate={handleImpersonate}
        onAdminCreated={loadTabData}
      />

      {/* Tenant Create / Edit Form Modal */}
      <SaaSTenantFormModal
        isOpen={isTenantFormOpen}
        tenantToEdit={tenantToEdit}
        onClose={() => {
          setIsTenantFormOpen(false);
          setTenantToEdit(null);
        }}
        onSubmit={handleTenantFormSubmit}
        isLoading={isFormSubmitting}
      />
    </div>
  );
}

export default function SaaSAdminPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
        </div>
      }
    >
      <SaaSAdminContent />
    </Suspense>
  );
}
