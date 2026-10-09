import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Building07, DotsVertical, Plus } from "@untitledui/icons";
import { saasApi, type Tenant } from "@/api/client";
import {
  RefButton,
  RefCard,
  RefMetricGrid,
  RefPageHeader,
  RefSidePanel,
  RefStateView,
  RefTableToolbar,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";
import { avatarToneFor, formatDate, formatRelative, initialsFor, useApi } from "./use-api";

type Plan = "Enterprise" | "Growth" | "Starter";
type Status = "Active" | "Suspended" | "Pending";

function normalizePlan(value: string | undefined): Plan {
  const v = (value || "").toLowerCase();
  if (v.includes("enterprise")) return "Enterprise";
  if (v.includes("starter")) return "Starter";
  return "Growth";
}

function statusFor(tenant: Tenant): Status {
  if (!tenant.is_active) return "Suspended";
  const ageDays = (Date.now() - new Date(tenant.created_at).getTime()) / 86_400_000;
  if (ageDays < 14) return "Pending";
  return "Active";
}

function statusPill(status: Status) {
  const cls = status === "Active" ? "ref-pill-success" : status === "Suspended" ? "ref-pill-error" : "ref-pill-warning";
  return <span className={`ref-pill ${cls}`}><i />{status}</span>;
}

function planBadge(plan: Plan) {
  return <span className={`plan-badge plan-${plan.toLowerCase()}`}>{plan}</span>;
}

const FILTERS: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Active", label: "Active" },
  { id: "Suspended", label: "Suspended" },
  { id: "Pending", label: "Pending onboarding" },
];

const PLAN_FILTERS: { id: "all" | Plan; label: string }[] = [
  { id: "all", label: "All plans" },
  { id: "Enterprise", label: "Enterprise" },
  { id: "Growth", label: "Growth" },
  { id: "Starter", label: "Starter" },
];

export default function RefTenantsScreen() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi<Tenant[]>(() => saasApi.getTenants());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [plan, setPlan] = useState<"all" | Plan>("all");
  const [openTenant, setOpenTenant] = useState<Tenant | null>(null);

  const tenants = data ?? [];
  const filtered = useMemo(() => tenants.filter((t) => {
    const s = statusFor(t);
    const p = normalizePlan(t.plan);
    const matchesQuery = !query || t.name.toLowerCase().includes(query.toLowerCase()) || t.domain_url.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || s === status;
    const matchesPlan = plan === "all" || p === plan;
    return matchesQuery && matchesStatus && matchesPlan;
  }), [tenants, query, status, plan]);

  const total = tenants.length;
  const active = tenants.filter((t) => statusFor(t) === "Active").length;
  const suspended = tenants.filter((t) => statusFor(t) === "Suspended").length;
  const pending = tenants.filter((t) => statusFor(t) === "Pending").length;

  return (
    <ReferenceShell active="Tenants">
      <RefPageHeader
        eyebrow="Workspace / Tenants"
        title="Tenants"
        description="Provision, monitor, and bill every ISP workspace across the ShebaFi platform."
        actions={
          <>
            <RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>
            <RefButton variant="primary" icon={Plus} onClick={() => navigate("/onboarding")}>Provision tenant</RefButton>
          </>
        }
      />

      <div className="ref-section-grid">
        <RefMetricGrid
          metrics={[
            { label: "Total tenants", value: total.toLocaleString(), icon: Building07, tone: "blue" },
            { label: "Active", value: active.toLocaleString(), icon: Building07, tone: "green" },
            { label: "Suspended", value: suspended.toLocaleString(), icon: Building07, tone: "orange" },
            { label: "Pending onboarding", value: pending.toLocaleString(), icon: Building07, tone: "purple" },
          ]}
        />
        <div />
      </div>

      <RefCard
        title="All tenants"
        description={loading ? "Loading…" : `${filtered.length} of ${total} matching current view`}
      >
        <RefTableToolbar
          searchPlaceholder="Search tenants"
          searchValue={query}
          onSearchChange={setQuery}
          actions={<RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>}
        />
        <div className="ref-chips">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`ref-chip ${status === f.id ? "ref-chip-active" : ""}`} onClick={() => setStatus(f.id)}>{f.label}</button>
          ))}
          <span style={{ width: 1, background: "var(--border)", margin: "2px 6px" }} />
          {PLAN_FILTERS.map((p) => (
            <button key={p.id} type="button" className={`ref-chip ${plan === p.id ? "ref-chip-active" : ""}`} onClick={() => setPlan(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="table-scroll ref-table">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Schema</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Created</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && filtered.length === 0}
                emptyTitle="No tenants match these filters"
                emptyDescription="Try clearing the search or selecting a different status."
                onRetry={refetch}
              >
                {filtered.map((t) => {
                  const s = statusFor(t);
                  const p = normalizePlan(t.plan);
                  return (
                    <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setOpenTenant(t)}>
                      <td>
                        <div className="tenant-name-cell">
                          <span className={`tenant-avatar ${avatarToneFor(t.id)}`}>{initialsFor(t.name)}</span>
                          <span><strong>{t.name}</strong><small>{t.domain_url}</small></span>
                        </div>
                      </td>
                      <td>{planBadge(p)}</td>
                      <td>{t.schema_name || "—"}</td>
                      <td>{t.contact_email || "—"}</td>
                      <td>{statusPill(s)}</td>
                      <td>{formatRelative(t.created_at)}</td>
                      <td><button className="icon-button subtle" type="button" aria-label={`Actions for ${t.name}`} onClick={(e) => e.stopPropagation()}><DotsVertical /></button></td>
                    </tr>
                  );
                })}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      <RefSidePanel
        open={!!openTenant}
        title={openTenant?.name ?? ""}
        subtitle={openTenant?.domain_url}
        onClose={() => setOpenTenant(null)}
        actions={
          <>
            <RefButton variant="secondary" onClick={() => setOpenTenant(null)}>Close</RefButton>
            <RefButton variant="primary" onClick={() => setOpenTenant(null)}>Open tenant</RefButton>
          </>
        }
      >
        {openTenant && (
          <>
            <h4>Plan &amp; status</h4>
            <dl>
              <dt>Plan</dt><dd>{planBadge(normalizePlan(openTenant.plan))}</dd>
              <dt>Status</dt><dd>{statusPill(statusFor(openTenant))}</dd>
              <dt>Schema</dt><dd>{openTenant.schema_name || "—"}</dd>
            </dl>
            <h4>Billing</h4>
            <dl>
              <dt>Contact email</dt><dd>{openTenant.contact_email || "—"}</dd>
              <dt>Contact phone</dt><dd>{openTenant.contact_phone || "—"}</dd>
              <dt>Address</dt><dd>{openTenant.address || "—"}</dd>
            </dl>
            <h4>Lifecycle</h4>
            <dl>
              <dt>Created</dt><dd>{formatDate(openTenant.created_at)}</dd>
              <dt>Updated</dt><dd>{formatDate(openTenant.updated_at)}</dd>
            </dl>
          </>
        )}
      </RefSidePanel>
    </ReferenceShell>
  );
}