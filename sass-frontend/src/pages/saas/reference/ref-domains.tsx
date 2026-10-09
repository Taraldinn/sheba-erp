import { useMemo, useState } from "react";
import { Clock, Clipboard, Globe01, LayersThree01, Plus, ShieldTick } from "@untitledui/icons";
import { saasApi, type Domain } from "@/api/client";
import {
  RefButton,
  RefCard,
  RefMetricGrid,
  RefPageHeader,
  RefStateView,
  RefTableToolbar,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";
import { avatarToneFor, formatRelative, initialsFor, useApi } from "./use-api";

type Status = "Verified" | "Pending" | "Failed" | "Expiring";

function statusFor(d: Domain): Status {
  if (d.is_active && d.ssl_active) return "Verified";
  if (d.is_active && d.ssl_active === false) return "Expiring";
  if (!d.is_active) return "Failed";
  return "Pending";
}

function statusPill(s: Status) {
  const cls =
    s === "Verified" ? "ref-pill-success" :
    s === "Pending" ? "ref-pill-warning" :
    s === "Failed" ? "ref-pill-error" :
    "ref-pill-warning";
  return <span className={`ref-pill ${cls}`}><i />{s}</span>;
}

const FILTERS: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Verified", label: "Verified" },
  { id: "Pending", label: "Pending" },
  { id: "Failed", label: "Failed" },
  { id: "Expiring", label: "Expiring" },
];

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ref-chip"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      style={{ fontFamily: "ui-monospace, monospace" }}
      aria-label={`Copy ${value}`}
    >
      {value} {copied ? "✓" : <Clipboard />}
    </button>
  );
}

export default function RefDomainsScreen() {
  const { data, loading, error, refetch } = useApi<Domain[]>(() => saasApi.getDomains());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const domains = data ?? [];
  const filtered = useMemo(() => domains.filter((d) => {
    const q = !query || d.domain.toLowerCase().includes(query.toLowerCase()) || (d.tenant_name || "").toLowerCase().includes(query.toLowerCase());
    const f = filter === "all" || statusFor(d) === filter;
    return q && f;
  }), [domains, query, filter]);

  const total = domains.length;
  const verified = domains.filter((d) => statusFor(d) === "Verified").length;
  const pending = domains.filter((d) => statusFor(d) === "Pending").length;
  const expiring = domains.filter((d) => statusFor(d) === "Expiring").length;

  const handleVerify = async (id: string) => {
    setBusy(id);
    try {
      await saasApi.verifyDomain(id);
      setToast("DNS verification toggled");
      await refetch();
    } catch (err: any) {
      setToast(`Couldn't verify: ${err?.message ?? "request failed"}`);
    } finally {
      setBusy(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  return (
    <ReferenceShell active="Domain">
      <RefPageHeader
        eyebrow="Workspace / Domains"
        title="Domains"
        description="Manage DNS verification, TLS provisioning, and custom domains for every tenant."
        actions={
          <>
            <RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>
            <RefButton variant="primary" icon={Plus}>Add domain</RefButton>
          </>
        }
      />

      <RefMetricGrid
        metrics={[
          { label: "Total domains", value: total.toLocaleString(), icon: LayersThree01, tone: "purple" },
          { label: "Verified", value: verified.toLocaleString(), icon: ShieldTick, tone: "green" },
          { label: "Pending", value: pending.toLocaleString(), icon: Clock, tone: "orange" },
          { label: "Expiring soon", value: expiring.toLocaleString(), icon: Globe01, tone: "orange" },
        ]}
      />

      <RefCard title="Domain inventory" description={loading ? "Loading…" : `${filtered.length} of ${total} matching`}>
        <RefTableToolbar
          searchPlaceholder="Search by domain or tenant"
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
                <th>Domain</th>
                <th>Tenant</th>
                <th>Primary</th>
                <th>DNS verification</th>
                <th>SSL</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && filtered.length === 0}
                emptyTitle="No domains yet"
                emptyDescription="Provision a tenant to start issuing subdomains."
                onRetry={refetch}
              >
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td><strong style={{ color: "var(--gray-700)", fontSize: 12 }}>{row.domain}</strong></td>
                    <td>
                      <div className="tenant-name-cell">
                        <span className={`tenant-avatar ${avatarToneFor(row.tenant_id)}`}>{initialsFor(row.tenant_name || row.domain)}</span>
                        <span><strong>{row.tenant_name || row.tenant_id}</strong></span>
                      </div>
                    </td>
                    <td>{row.is_primary ? <span className="ref-pill ref-pill-brand"><i />Primary</span> : <span className="ref-pill ref-pill-neutral"><i />Alias</span>}</td>
                    <td>
                      {row.is_active
                        ? <span className="ref-pill ref-pill-success"><i />Verified</span>
                        : <span className="ref-pill ref-pill-warning"><i />Pending</span>}
                    </td>
                    <td>
                      {row.ssl_active
                        ? <span className="ref-pill ref-pill-success"><i />Active</span>
                        : <span className="ref-pill ref-pill-warning"><i />Inactive</span>}
                    </td>
                    <td>{statusPill(statusFor(row))}</td>
                    <td>
                      <RefButton variant="secondary" disabled={busy === row.id} onClick={() => handleVerify(row.id)}>
                        {busy === row.id ? "Verifying…" : "Verify"}
                      </RefButton>
                    </td>
                  </tr>
                ))}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      <RefCard title="DNS records" description="Copy-and-paste records to verify your domains.">
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.slice(0, 4).map((row) => (
            <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 9, flexWrap: "wrap" }}>
              <strong style={{ color: "var(--gray-900)", fontSize: 12, minWidth: 200 }}>{row.domain}</strong>
              <CopyChip value="CNAME edge.shebafi.com" />
              <span style={{ color: "var(--gray-400)", fontSize: 11, marginLeft: "auto" }}>Last checked {formatRelative(row.created_at)}</span>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="empty-row">No DNS records to display.</div>
          )}
        </div>
      </RefCard>

      {toast && <div className="toast"><span><ShieldTick /></span>{toast}</div>}
    </ReferenceShell>
  );
}