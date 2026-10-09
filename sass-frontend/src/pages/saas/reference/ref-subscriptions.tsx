import { useMemo, useState } from "react";
import { CreditCard01, DotsVertical, RefreshCw01 } from "@untitledui/icons";
import { saasApi, type Subscription } from "@/api/client";
import {
  RefButton,
  RefCard,
  RefMetricGrid,
  RefPageHeader,
  RefStateView,
  RefTableToolbar,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";
import { avatarToneFor, formatDate, initialsFor, useApi } from "./use-api";

type Status = "Active" | "Trial" | "Past due" | "Cancelled" | "Paused";

function statusFor(sub: Subscription): Status {
  const s = (sub.status || "").toLowerCase();
  if (s === "active") return "Active";
  if (s === "trial" || s === "trialing") return "Trial";
  if (s === "past_due") return "Past due";
  if (s === "paused") return "Paused";
  if (s === "cancelled" || s === "canceled" || s === "expired") return "Cancelled";
  return "Active";
}

function statusPill(s: Status) {
  const cls =
    s === "Active" ? "ref-pill-success" :
    s === "Trial" ? "ref-pill-brand" :
    s === "Past due" ? "ref-pill-error" :
    s === "Cancelled" ? "ref-pill-neutral" :
    "ref-pill-warning";
  return <span className={`ref-pill ${cls}`}><i />{s}</span>;
}

function billingPill(sub: Subscription) {
  const d = new Date(sub.current_period_end);
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <span className="ref-pill ref-pill-error"><i />Overdue</span>;
  if (days <= 3) return <span className="ref-pill ref-pill-warning"><i />Due soon</span>;
  return <span className="ref-pill ref-pill-success"><i />Paid</span>;
}

const FILTERS: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Active", label: "Active" },
  { id: "Trial", label: "Trial" },
  { id: "Past due", label: "Past due" },
  { id: "Paused", label: "Paused" },
  { id: "Cancelled", label: "Cancelled" },
];

export default function RefSubscriptionsScreen() {
  const { data, loading, error, refetch } = useApi<Subscription[]>(() => saasApi.getSubscriptions());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const subs = data ?? [];
  const filtered = useMemo(() => subs.filter((s) => {
    const q = !query || (s.tenant_name || "").toLowerCase().includes(query.toLowerCase());
    const f = filter === "all" || statusFor(s) === filter;
    return q && f;
  }), [subs, query, filter]);

  const total = subs.length;
  const active = subs.filter((s) => statusFor(s) === "Active").length;
  const trial = subs.filter((s) => statusFor(s) === "Trial").length;
  const pastDue = subs.filter((s) => statusFor(s) === "Past due").length;

  const handleCancel = async (sub: Subscription) => {
    setBusy(sub.id);
    try {
      await saasApi.cancelSubscription(sub.id);
      setToast(`Subscription cancelled`);
      await refetch();
    } catch (err: any) {
      setToast(`Couldn't cancel: ${err?.message ?? "request failed"}`);
    } finally {
      setBusy(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  return (
    <ReferenceShell active="Plans & billing">
      <RefPageHeader
        eyebrow="Workspace / Plans &amp; billing / Subscriptions"
        title="Subscriptions"
        description="Active tenant subscriptions, auto-renewal state, and billing status."
        actions={
          <>
            <RefButton variant="secondary" icon={RefreshCw01} onClick={() => refetch()}>Refresh</RefButton>
          </>
        }
      />

      <RefMetricGrid
        metrics={[
          { label: "Total", value: total.toLocaleString(), icon: CreditCard01, tone: "purple" },
          { label: "Active", value: active.toLocaleString(), icon: CreditCard01, tone: "green" },
          { label: "Trial", value: trial.toLocaleString(), icon: CreditCard01, tone: "orange" },
          { label: "Past due", value: pastDue.toLocaleString(), icon: CreditCard01, tone: "orange" },
        ]}
      />

      <RefCard title="All subscriptions" description={loading ? "Loading…" : `${filtered.length} of ${total} matching`}>
        <RefTableToolbar
          searchPlaceholder="Search by tenant"
          searchValue={query}
          onSearchChange={setQuery}
          actions={<RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>}
        />
        <div className="ref-chips">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`ref-chip ${filter === f.id ? "ref-chip-active" : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="table-scroll ref-table">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Started</th>
                <th>Next renewal</th>
                <th>Billing status</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && filtered.length === 0}
                emptyTitle="No subscriptions"
                emptyDescription="Approved onboarding requests will appear here."
                onRetry={refetch}
              >
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="tenant-name-cell">
                        <span className={`tenant-avatar ${avatarToneFor(row.tenant_id)}`}>{initialsFor(row.tenant_name || row.tenant_id)}</span>
                        <span><strong>{row.tenant_name || row.tenant_id}</strong><small>#{row.id}</small></span>
                      </div>
                    </td>
                    <td><span className="plan-badge plan-growth">{row.package_name || "Standard Tier"}</span></td>
                    <td>{row.created_at ? formatDate(row.created_at) : "—"}</td>
                    <td>{formatDate(row.current_period_end)}</td>
                    <td>{billingPill(row)}</td>
                    <td>{statusPill(statusFor(row))}</td>
                    <td>
                      <RefButton variant="secondary" disabled={busy === row.id || statusFor(row) === "Cancelled"} onClick={() => handleCancel(row)}>
                        {busy === row.id ? "Cancelling…" : "Cancel"}
                      </RefButton>
                    </td>
                  </tr>
                ))}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      {toast && <div className="toast"><span><CreditCard01 /></span>{toast}</div>}
    </ReferenceShell>
  );
}