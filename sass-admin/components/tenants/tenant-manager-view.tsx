"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card, Chip, Spinner } from "@heroui/react";

import { api, ApiError } from "@/lib/api";
import { AvatarGradient } from "@/components/avatar-gradient";
import { CreateTenantModal } from "@/components/tenants/create-tenant-modal";
import { TenantDetailDrawer } from "@/components/tenants/tenant-detail-drawer";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Tenant } from "@/lib/types";
import {
  CopyIcon,
  CheckIcon,
  SearchIcon,
  PlusIcon,
  EyeIcon,
  TrashIcon,
  ExternalLinkIcon,
  FilterIcon,
} from "@/components/nav-icons";

export function TenantManagerView() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-open create modal if ?action=new is in query string
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ results: Tenant[] } | Tenant[]>("/tenants/")
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
          ? data.results
          : [];
        setTenants(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(`${err.status} ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load tenants.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function copyToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  // Delete Tenant
  async function handleDeleteTenant() {
    if (!tenantToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/tenants/${tenantToDelete.id}/`);
      setTenantToDelete(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete tenant.");
    } finally {
      setDeleting(false);
    }
  }

  // Filtered tenants
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.primary_domain?.toLowerCase().includes(q) ||
        String(t.id).includes(q);

      const matchesPlan =
        planFilter === "all" ||
        (t.plan || "Growth").toLowerCase() === planFilter.toLowerCase();

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && t.is_active !== false) ||
        (statusFilter === "inactive" && t.is_active === false);

      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [tenants, searchQuery, planFilter, statusFilter]);

  const activeCount = tenants.filter((t) => t.is_active !== false).length;
  const suspendedCount = tenants.length - activeCount;

  return (
    <div className="flex flex-col gap-6">
      {/* Header with Title and Quick Counts */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Tenant Management
            </h1>
            <Chip color="accent" size="sm" variant="soft">
              {tenants.length} Enrolled
            </Chip>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Provision, inspect, and manage multi-tenant ISP organizations and network infrastructures.
          </p>
        </div>

        {/* Action Toolbar Buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="tertiary"
            className="rounded-full text-xs font-semibold"
            onPress={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </Button>

          <Button
            size="sm"
            className="rounded-full bg-accent text-accent-foreground px-4 text-xs font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer"
            onPress={() => setIsCreateOpen(true)}
          >
            <PlusIcon size={14} />
            <span>Create Tenant</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert status="danger" title="Error loading tenants">
          {error}
        </Alert>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-2xl border border-separator/80 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Total Tenants
          </span>
          <p className="mt-1 text-2xl font-bold text-foreground">{tenants.length}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-separator/80 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Active ISPs
          </span>
          <p className="mt-1 text-2xl font-bold text-success">{activeCount}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-separator/80 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Suspended
          </span>
          <p className="mt-1 text-2xl font-bold text-muted">{suspendedCount}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-separator/80 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Total Capacity
          </span>
          <p className="mt-1 text-2xl font-bold text-foreground">5,000 Subs</p>
        </Card>
      </div>

      {/* Main Table Card matching Reference Image 2 */}
      <Card className="rounded-2xl border border-separator/80 bg-surface shadow-sm overflow-hidden">
        {/* Table Filters Toolbar */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-separator/80">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex items-center">
              <span className="absolute left-3 text-muted">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                placeholder="Filter by name, slug, domain..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-56 sm:w-72 rounded-full border border-separator/80 bg-surface-secondary/40 pl-8 pr-3 text-xs placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
              />
            </div>

            {/* Plan Filter */}
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="h-8 rounded-full border border-separator/80 bg-surface-secondary/40 px-3 text-xs text-foreground focus:border-foreground focus:outline-none transition-all cursor-pointer"
            >
              <option value="all">All Plans</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-full border border-separator/80 bg-surface-secondary/40 px-3 text-xs text-foreground focus:border-foreground focus:outline-none transition-all cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <span className="text-xs text-muted">
            Showing <strong className="text-foreground">{filteredTenants.length}</strong> of {tenants.length} tenants
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-separator/60 bg-surface-secondary/40 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3">Tenant ID</th>
                <th className="px-5 py-3">Organization</th>
                <th className="px-5 py-3">Primary Domain</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Routers</th>
                <th className="px-5 py-3">Subscribers</th>
                <th className="px-5 py-3">Admin</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator/40">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-xs text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading tenants…
                    </div>
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-xs text-muted">
                    No tenants found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const shortId = `#${String(t.id).slice(0, 8)}`;
                  const isCopied = copiedId === String(t.id);
                  const domainUrl = t.primary_domain || `${t.slug}.shebafi.xyz`;

                  return (
                    <tr
                      key={String(t.id)}
                      className="hover:bg-default/30 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedTenant(t);
                        setIsDrawerOpen(true);
                      }}
                    >
                      {/* Tenant ID with copy */}
                      <td
                        className="px-5 py-3.5 font-mono text-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(String(t.id));
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
                          <span>{shortId}</span>
                          {isCopied ? (
                            <CheckIcon size={12} className="text-success" />
                          ) : (
                            <CopyIcon size={12} className="opacity-60" />
                          )}
                        </span>
                      </td>

                      {/* Organization Name & Avatar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <AvatarGradient name={t.name || t.slug} size="sm" />
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {t.name}
                            </span>
                            <span className="text-[10px] text-muted font-mono">
                              {t.slug}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Domain */}
                      <td
                        className="px-5 py-3.5 font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={`https://${domainUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:underline"
                        >
                          <span>{domainUrl}</span>
                          <ExternalLinkIcon size={11} className="opacity-60" />
                        </a>
                      </td>

                      {/* Plan */}
                      <td className="px-5 py-3.5">
                        <Chip size="sm" variant="soft" color="accent" className="text-[10px] font-semibold">
                          {t.plan || "Growth"}
                        </Chip>
                      </td>

                      {/* Routers */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" />
                          {t.online_router_count ?? 1} / {t.router_count ?? 1}
                        </span>
                      </td>

                      {/* Subscribers */}
                      <td className="px-5 py-3.5 font-semibold text-foreground">
                        {t.active_subscribers_count ?? 0}
                      </td>

                      {/* Admin User */}
                      <td className="px-5 py-3.5 font-mono text-muted">
                        {t.admin_username || `${t.slug}_admin`}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <Chip
                          size="sm"
                          variant="soft"
                          color={t.is_active === false ? "danger" : "success"}
                          className="text-[10px] font-semibold"
                        >
                          {t.is_active === false ? "Inactive" : "Active"}
                        </Chip>
                      </td>

                      {/* Action Icons matching Reference Image 2 */}
                      <td
                        className="px-5 py-3.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Inspect telemetry"
                            onClick={() => {
                              setSelectedTenant(t);
                              setIsDrawerOpen(true);
                            }}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-separator/60 text-muted transition-colors hover:bg-default/50 hover:text-foreground cursor-pointer"
                          >
                            <EyeIcon size={14} />
                          </button>

                          <button
                            type="button"
                            title="Delete tenant"
                            onClick={() => setTenantToDelete(t)}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-separator/60 text-muted transition-colors hover:bg-danger/10 hover:text-danger hover:border-danger/30 cursor-pointer"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Tenant Modal */}
      <CreateTenantModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      {/* Tenant Telemetry Detail Drawer */}
      <TenantDetailDrawer
        tenant={selectedTenant}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onStatusChanged={() => setRefreshKey((k) => k + 1)}
      />

      {/* Delete Confirmation Dialog matching Reference Image 1 */}
      {tenantToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setTenantToDelete(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-separator/80 bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-danger/15 text-danger">
                <TrashIcon size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Delete Tenant</h3>
                <p className="text-xs text-muted">Permanent action</p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted leading-relaxed">
              Are you sure you want to delete <strong className="text-foreground">{tenantToDelete.name}</strong>?
              This will remove all subscriber tables, routers, and staff access permanently.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTenantToDelete(null)}
                className="rounded-full px-4 py-2 text-xs font-semibold text-foreground hover:bg-default/50 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <Button
                isDisabled={deleting}
                onPress={handleDeleteTenant}
                className="rounded-full bg-danger text-white px-4 py-2 text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
              >
                {deleting ? "Deleting…" : "Delete Tenant"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
