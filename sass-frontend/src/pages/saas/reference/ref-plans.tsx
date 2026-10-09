import { useMemo, useState } from "react";
import { CreditCard01, DotsVertical, Plus } from "@untitledui/icons";
import { saasApi, type Package } from "@/api/client";
import {
  RefButton,
  RefCard,
  RefMetricGrid,
  RefPageHeader,
  RefStateView,
  RefTableToolbar,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";
import { useApi } from "./use-api";

type PlanId = "Enterprise" | "Growth" | "Starter";

function asPlanId(value: string | undefined): PlanId {
  const v = (value || "").toLowerCase();
  if (v.includes("enterprise")) return "Enterprise";
  if (v.includes("starter")) return "Starter";
  return "Growth";
}

function planCard(pkg: Package) {
  const tone = asPlanId(pkg.name);
  return {
    id: tone,
    name: pkg.name,
    price: pkg.price ? `$${pkg.price}` : "Custom",
    blurb: pkg.features[0] ?? `${pkg.subscriber_count ?? 0} active subscriptions`,
    features: pkg.features.length ? pkg.features : ["Includes the core billing surface"],
    subscribers: "—",
    routers: "—",
    bandwidth: "—",
    active: pkg.subscriber_count ?? 0,
    status: pkg.is_active ? ("Active" as const) : ("Archived" as const),
  };
}

export default function RefPlansScreen() {
  const { data, loading, error, refetch } = useApi<Package[]>(() => saasApi.getPackages());
  const [editing, setEditing] = useState<Package | null>(null);
  const [editPrice, setEditPrice] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  const packages = data ?? [];
  const plans = useMemo(() => packages.map(planCard), [packages]);

  const totalActive = packages.reduce((sum, p) => sum + (p.subscriber_count ?? 0), 0);
  const avgPrice = packages.length ? Math.round(packages.reduce((sum, p) => sum + p.price, 0) / packages.length) : 0;

  const openEdit = (pkg: Package) => {
    setEditing(pkg);
    setEditPrice(String(pkg.price));
  };

  const handleSave = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await saasApi.updatePackage(editing.id, { price: Number(editPrice) || editing.price });
      setToast(`${editing.name} updated`);
      await refetch();
      setEditing(null);
    } catch (err: any) {
      setToast(`Couldn't save: ${err?.message ?? "request failed"}`);
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  return (
    <ReferenceShell active="Plans & billing">
      <RefPageHeader
        eyebrow="Workspace / Plans &amp; billing"
        title="Plans &amp; billing"
        description="Manage subscription tiers, limits, and active tenant counts."
        actions={
          <>
            <RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>
            <RefButton variant="primary" icon={Plus}>New package</RefButton>
          </>
        }
      />

      <RefMetricGrid
        metrics={[
          { label: "Plans", value: packages.length.toLocaleString(), icon: CreditCard01, tone: "purple" },
          { label: "Active subscriptions", value: totalActive.toLocaleString(), icon: CreditCard01, tone: "green" },
          { label: "Average price", value: `$${avgPrice}`, icon: CreditCard01, tone: "blue" },
          { label: "Active tiers", value: packages.filter((p) => p.is_active).length.toLocaleString(), icon: CreditCard01, tone: "orange" },
        ]}
      />

      {loading ? (
        <RefStateView loading />
      ) : error ? (
        <RefStateView error={error} onRetry={refetch} />
      ) : plans.length === 0 ? (
        <RefStateView empty title="No plans yet" emptyDescription="Create a package to start billing tenants." onRetry={refetch} />
      ) : (
        <div className="ref-plan-grid">
          {plans.map((plan) => (
            <div key={plan.id} className={`ref-plan-card ${plan.id === "Growth" ? "ref-plan-card-active" : ""}`}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <h3>{plan.name}</h3>
                  <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 12 }}>{plan.blurb}</p>
                </div>
                <button className="icon-button subtle" type="button" aria-label={`Options for ${plan.name}`}><DotsVertical /></button>
              </div>
              <div className="ref-plan-price">
                <strong>{plan.price}</strong>
                <small>{plan.id === "Enterprise" ? "On request" : "/ month"}</small>
              </div>
              <ul className="ref-plan-features">
                {plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <span style={{ color: "var(--gray-500)", fontSize: 11 }}>{plan.active} active subscriptions</span>
                <RefButton variant="secondary" onClick={() => openEdit((data ?? []).find((p) => p.name === plan.name) as Package)}>Edit package</RefButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <RefCard title="Plan comparison" description="Limits and active tenant counts per tier.">
        <RefTableToolbar actions={<RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>} />
        <div className="table-scroll ref-table">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Monthly price</th>
                <th>Currency</th>
                <th>Billing interval</th>
                <th>Subscriptions</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && packages.length === 0}
                emptyTitle="No packages"
                onRetry={refetch}
              >
                {packages.map((p) => (
                  <tr key={p.id}>
                    <td><span className={`plan-badge plan-${asPlanId(p.name).toLowerCase()}`}>{p.name}</span></td>
                    <td className="revenue-cell">${p.price}</td>
                    <td>{p.currency}</td>
                    <td>{p.billing_interval ?? "monthly"}</td>
                    <td><strong style={{ color: "var(--gray-700)", fontSize: 12 }}>{p.subscriber_count ?? 0}</strong></td>
                    <td><span className={`ref-pill ${p.is_active ? "ref-pill-success" : "ref-pill-neutral"}`}><i />{p.is_active ? "Active" : "Archived"}</span></td>
                  </tr>
                ))}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="plan-edit" onMouseDown={(e) => e.stopPropagation()}>
            <h2 id="plan-edit">Edit {editing.name}</h2>
            <p>Update the monthly price. Active subscriptions are unaffected.</p>
            <label className="ref-field">Monthly price (USD)<input type="number" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} /></label>
            <div className="modal-actions">
              <RefButton variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</RefButton>
              <RefButton variant="primary" disabled={busy} onClick={handleSave}>{busy ? "Saving…" : "Save changes"}</RefButton>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span><CreditCard01 /></span>{toast}</div>}
    </ReferenceShell>
  );
}