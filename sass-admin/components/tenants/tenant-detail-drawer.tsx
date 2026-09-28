"use client";

import type { Tenant } from "@/lib/types";

import { useState } from "react";
import { Chip, Button, Spinner } from "@heroui/react";

import { AvatarGradient } from "@/components/avatar-gradient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";

type Props = {
  tenant: Tenant | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChanged: () => void;
};

export function TenantDetailDrawer({
  tenant,
  isOpen,
  onClose,
  onStatusChanged,
}: Props) {
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  if (!isOpen || !tenant) return null;

  async function handleToggleStatus() {
    if (!tenant) return;
    setToggling(true);
    setToggleError(null);
    try {
      const newStatus = !tenant.is_active;

      await api.patch(`/tenants/${tenant.id}/`, {
        is_active: newStatus,
        subscription_status: newStatus ? "active" : "suspended",
      });
      onStatusChanged();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setToggleError(err.message);
      } else {
        setToggleError(
          err instanceof Error ? err.message : "Failed to update status.",
        );
      }
    } finally {
      setToggling(false);
    }
  }

  const admins =
    (tenant.admins as Array<{
      id: number;
      username: string;
      email?: string;
      phone?: string;
      full_name?: string;
      last_login?: string;
    }>) || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        aria-label="Close drawer backdrop"
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-default"
        type="button"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative z-10 w-full max-w-md bg-surface h-full shadow-2xl border-l border-separator/80 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-separator/80 p-5">
            <div className="flex items-center gap-3">
              <AvatarGradient name={tenant.name || tenant.slug} size="md" />
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {tenant.name}
                </h3>
                <span className="text-xs text-muted font-mono">
                  {tenant.slug}
                </span>
              </div>
            </div>
            <button
              className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-default/50 hover:text-foreground cursor-pointer"
              type="button"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {toggleError && (
            <div className="m-4 rounded-xl bg-danger/10 border border-danger/20 p-3 text-xs text-danger">
              {toggleError}
            </div>
          )}

          {/* Body Sections */}
          <div className="flex flex-col gap-6 p-5">
            {/* Status & Plan Summary */}
            <div className="flex items-center justify-between rounded-2xl border border-separator/80 bg-surface-secondary/40 p-4">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Subscription Status
                </span>
                <div className="flex items-center gap-2">
                  <Chip
                    className="text-[11px] font-semibold"
                    color={tenant.is_active === false ? "danger" : "success"}
                    size="sm"
                    variant="soft"
                  >
                    {tenant.is_active === false ? "Suspended" : "Active"}
                  </Chip>
                  <Chip
                    className="text-[11px] font-semibold"
                    color="accent"
                    size="sm"
                    variant="soft"
                  >
                    {tenant.plan || "Growth Plan"}
                  </Chip>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Monthly Vol
                </span>
                <p className="text-sm font-bold text-foreground">
                  {formatCurrency(Number(tenant.monthly_billing_volume || 0))}
                </p>
              </div>
            </div>

            {/* Fleet Telemetry Grid */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Fleet & Infrastructure Telemetry
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-separator/60 p-3 bg-surface">
                  <span className="text-[11px] text-muted block">
                    Routers Online
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    {tenant.online_router_count ?? 1} /{" "}
                    {tenant.router_count ?? 1}
                  </span>
                </div>
                <div className="rounded-xl border border-separator/60 p-3 bg-surface">
                  <span className="text-[11px] text-muted block">
                    Subscribers
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    {tenant.active_subscribers_count ?? 0}
                  </span>
                </div>
                <div className="rounded-xl border border-separator/60 p-3 bg-surface">
                  <span className="text-[11px] text-muted block">
                    POP Branches
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    {tenant.active_pop_count ?? 0} / {tenant.pop_count ?? 0}
                  </span>
                </div>
                <div className="rounded-xl border border-separator/60 p-3 bg-surface">
                  <span className="text-[11px] text-muted block">
                    OLTs / ONUs
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    {tenant.olt_count ?? 0} / {tenant.onu_count ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Domains */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Associated Domains
              </h4>
              <div className="rounded-xl border border-separator/70 divide-y divide-separator/60 overflow-hidden bg-surface">
                <div className="flex items-center justify-between p-3 text-xs">
                  <span className="font-mono text-foreground font-medium">
                    {tenant.primary_domain || `${tenant.slug}.shebafi.xyz`}
                  </span>
                  <Chip
                    className="text-[10px]"
                    color="success"
                    size="sm"
                    variant="soft"
                  >
                    Primary SSL
                  </Chip>
                </div>
                <div className="flex items-center justify-between p-3 text-xs">
                  <span className="font-mono text-muted">
                    {tenant.slug}.localhost
                  </span>
                  <Chip
                    className="text-[10px]"
                    color="accent"
                    size="sm"
                    variant="soft"
                  >
                    Dev Alias
                  </Chip>
                </div>
              </div>
            </div>

            {/* Authorized Admins */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Tenant Administrators
              </h4>
              {admins.length === 0 ? (
                <p className="text-xs text-muted">
                  Admin username:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {tenant.admin_username || `${tenant.slug}_admin`}
                  </span>
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {admins.map((adm) => (
                    <div
                      key={adm.id}
                      className="flex items-center justify-between rounded-xl border border-separator/60 p-3 text-xs bg-surface"
                    >
                      <div className="flex items-center gap-2.5">
                        <AvatarGradient name={adm.username} size="sm" />
                        <div>
                          <p className="font-semibold text-foreground">
                            {adm.username}
                          </p>
                          <p className="text-[10px] text-muted">
                            {adm.email || "No email"}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted">
                        Login: {adm.last_login || "Never"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="rounded-xl border border-separator/50 bg-surface-secondary/20 p-3 text-[11px] text-muted space-y-1">
              <p>
                Tenant UUID:{" "}
                <span className="font-mono text-foreground">
                  {String(tenant.id)}
                </span>
              </p>
              <p>
                Created:{" "}
                <span className="text-foreground">
                  {tenant.created_at ? formatDate(tenant.created_at) : "—"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-separator/80 p-4 bg-surface flex items-center justify-between gap-3">
          <Button
            className="rounded-full text-xs font-semibold"
            size="sm"
            variant="tertiary"
            onPress={onClose}
          >
            Close
          </Button>

          <Button
            className={`rounded-full px-4 text-xs font-semibold ${
              tenant.is_active === false
                ? "bg-success text-white"
                : "bg-danger text-white"
            }`}
            isDisabled={toggling}
            size="sm"
            onPress={handleToggleStatus}
          >
            {toggling ? (
              <span className="flex items-center gap-1.5">
                <Spinner size="sm" /> Updating…
              </span>
            ) : tenant.is_active === false ? (
              "Activate Tenant"
            ) : (
              "Suspend Tenant"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
