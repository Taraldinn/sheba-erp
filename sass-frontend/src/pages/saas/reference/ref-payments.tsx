import { useMemo, useState } from "react";
import { BarChartSquare02, CoinsStacked01, DotsVertical } from "@untitledui/icons";
import { saasApi, type Payment } from "@/api/client";
import {
  RefButton,
  RefCard,
  RefMetricGrid,
  RefPageHeader,
  RefStateView,
  RefTableToolbar,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";
import { formatDate, useApi } from "./use-api";

type Method = "bKash" | "Bank transfer" | "Manual" | "Card";

function methodFor(label: string | undefined): Method {
  const v = (label || "").toLowerCase();
  if (v.includes("bkash")) return "bKash";
  if (v.includes("bank")) return "Bank transfer";
  if (v.includes("manual")) return "Manual";
  return "Card";
}

function statusPill(s: Payment["status"]) {
  const cls =
    s === "succeeded" ? "ref-pill-success" :
    s === "pending" ? "ref-pill-warning" :
    s === "failed" ? "ref-pill-error" :
    "ref-pill-neutral";
  return <span className={`ref-pill ${cls}`}><i />{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

const METHOD_FILTERS: { id: "all" | Method; label: string }[] = [
  { id: "all", label: "All methods" },
  { id: "bKash", label: "bKash" },
  { id: "Bank transfer", label: "Bank transfer" },
  { id: "Card", label: "Card" },
  { id: "Manual", label: "Manual" },
];

const STATUS_FILTERS: { id: "all" | Payment["status"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "succeeded", label: "Succeeded" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
  { id: "refunded", label: "Refunded" },
];

export default function RefPaymentsScreen() {
  const { data, loading, error, refetch } = useApi<Payment[]>(() => saasApi.getPayments());
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<"all" | Method>("all");
  const [status, setStatus] = useState<"all" | Payment["status"]>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const payments = data ?? [];
  const filtered = useMemo(() => payments.filter((p) => {
    const q = !query || (p.tenant_name || "").toLowerCase().includes(query.toLowerCase());
    const m = method === "all" || methodFor(p.payment_method) === method;
    const s = status === "all" || p.status === status;
    return q && m && s;
  }), [payments, query, method, status]);

  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pending = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const failed = payments.filter((p) => p.status === "failed").reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const refunded = payments.filter((p) => p.status === "refunded").reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const handleRefund = async (p: Payment) => {
    setBusy(p.id);
    try {
      await saasApi.refundPayment(p.id);
      setToast(`Refund issued for ${p.tenant_name || p.id}`);
      await refetch();
    } catch (err: any) {
      setToast(`Couldn't refund: ${err?.message ?? "request failed"}`);
    } finally {
      setBusy(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  return (
    <ReferenceShell active="Payments">
      <RefPageHeader
        eyebrow="Workspace / Payments"
        title="Payments"
        description="Tenant revenue, gateway reconciliation, and refunds across every payment method."
        actions={
          <>
            <RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>
            <RefButton variant="primary" icon={BarChartSquare02}>Export</RefButton>
          </>
        }
      />

      <RefMetricGrid
        metrics={[
          { label: "Total collected", value: `$${total.toLocaleString()}`, icon: CoinsStacked01, tone: "green" },
          { label: "Pending", value: `$${pending.toLocaleString()}`, icon: CoinsStacked01, tone: "orange" },
          { label: "Failed", value: `$${failed.toLocaleString()}`, icon: CoinsStacked01, tone: "orange" },
          { label: "Refunded", value: `$${refunded.toLocaleString()}`, icon: CoinsStacked01, tone: "purple" },
        ]}
      />

      <RefCard title="Recent payments" description={loading ? "Loading…" : `${filtered.length} of ${payments.length} matching`}>
        <RefTableToolbar
          searchPlaceholder="Search by tenant"
          searchValue={query}
          onSearchChange={setQuery}
          actions={<RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>}
        />
        <div className="ref-chips">
          {METHOD_FILTERS.map((f) => (
            <button key={f.id} type="button" className={`ref-chip ${method === f.id ? "ref-chip-active" : ""}`} onClick={() => setMethod(f.id)}>{f.label}</button>
          ))}
          <span style={{ width: 1, background: "var(--border)", margin: "2px 6px" }} />
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} type="button" className={`ref-chip ${status === f.id ? "ref-chip-active" : ""}`} onClick={() => setStatus(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="table-scroll ref-table">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Date</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && filtered.length === 0}
                emptyTitle="No payments recorded"
                emptyDescription="Once tenants start paying, transactions appear here."
                onRetry={refetch}
              >
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td><strong style={{ color: "var(--gray-700)", fontSize: 12 }}>{row.tenant_name || row.subscription_id}</strong></td>
                    <td className="revenue-cell">${Number(row.amount).toLocaleString()} {row.currency}</td>
                    <td>{row.payment_method || "—"}</td>
                    <td>{statusPill(row.status)}</td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <RefButton variant="secondary" disabled={busy === row.id || row.status === "refunded"} onClick={() => handleRefund(row)}>
                        {busy === row.id ? "Refunding…" : "Refund"}
                      </RefButton>
                    </td>
                  </tr>
                ))}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      {toast && <div className="toast"><span><CoinsStacked01 /></span>{toast}</div>}
    </ReferenceShell>
  );
}