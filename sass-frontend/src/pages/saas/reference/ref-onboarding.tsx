import { useMemo, useState } from "react";
import { CheckCircle, Clock, DotsVertical, File02, Users01 } from "@untitledui/icons";
import { saasApi, type OnboardingRequest } from "@/api/client";
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
import { avatarToneFor, formatDate, initialsFor, useApi } from "./use-api";

type Verification = "Pending" | "Verified" | "Failed";

function deriveVerification(req: OnboardingRequest): Verification {
  if (req.status === "approved") return "Verified";
  if (req.status === "rejected") return "Failed";
  return "Pending";
}

function verificationPill(v: Verification) {
  if (v === "Verified") return <span className="ref-pill ref-pill-success"><i />{v}</span>;
  if (v === "Failed") return <span className="ref-pill ref-pill-error"><i />{v}</span>;
  return <span className="ref-pill ref-pill-warning"><i />{v}</span>;
}

function reviewPill(req: OnboardingRequest) {
  if (req.status === "approved") return <span className="ref-pill ref-pill-success"><i />Approved</span>;
  if (req.status === "rejected") return <span className="ref-pill ref-pill-error"><i />Rejected</span>;
  return <span className="ref-pill ref-pill-warning"><i />Pending</span>;
}

function planFromRequest(req: OnboardingRequest): "Enterprise" | "Growth" | "Starter" {
  const v = (req.plan_requested || "").toLowerCase();
  if (v.includes("enterprise")) return "Enterprise";
  if (v.includes("starter")) return "Starter";
  return "Growth";
}

const FILTERS: { id: "all" | OnboardingRequest["status"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function RefOnboardingScreen() {
  const { data, loading, error, refetch } = useApi<OnboardingRequest[]>(() => saasApi.getOnboardingRequests());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | OnboardingRequest["status"]>("all");
  const [open, setOpen] = useState<OnboardingRequest | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const requests = data ?? [];
  const filtered = useMemo(() => requests.filter((r) => {
    const q = !query || r.company_name.toLowerCase().includes(query.toLowerCase()) || r.email.toLowerCase().includes(query.toLowerCase());
    const f = filter === "all" || r.status === filter;
    return q && f;
  }), [requests, query, filter]);

  const total = requests.length;
  const pending = requests.filter((r) => r.status === "pending").length;
  const approved = requests.filter((r) => r.status === "approved").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;

  const handleApprove = async (req: OnboardingRequest) => {
    setBusy("approve");
    try {
      await saasApi.approveOnboarding(req.id);
      setToast(`${req.company_name} approved`);
      await refetch();
      setOpen(null);
    } catch (err: any) {
      setToast(`Couldn't approve: ${err?.message ?? "request failed"}`);
    } finally {
      setBusy(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  const handleReject = async (req: OnboardingRequest) => {
    setBusy("reject");
    try {
      await saasApi.rejectOnboarding(req.id, "Application rejected by platform administrator.");
      setToast(`${req.company_name} rejected`);
      await refetch();
      setOpen(null);
    } catch (err: any) {
      setToast(`Couldn't reject: ${err?.message ?? "request failed"}`);
    } finally {
      setBusy(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  return (
    <ReferenceShell active="Onboarding">
      <RefPageHeader
        eyebrow="Workspace / Onboarding"
        title="Onboarding pipeline"
        description="Approve new ISP tenants and provision isolated PostgreSQL schemas."
        actions={<RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>}
      />

      <RefMetricGrid
        metrics={[
          { label: "Total requests", value: total.toLocaleString(), icon: Users01, tone: "purple" },
          { label: "Pending", value: pending.toLocaleString(), icon: Clock, tone: "orange" },
          { label: "Approved", value: approved.toLocaleString(), icon: CheckCircle, tone: "green" },
          { label: "Rejected", value: rejected.toLocaleString(), icon: File02, tone: "blue" },
        ]}
      />

      <RefCard title="Onboarding requests" description={loading ? "Loading…" : `${filtered.length} of ${total} matching`}>
        <RefTableToolbar
          searchPlaceholder="Search by company or contact"
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
                <th>Organization</th>
                <th>Contact</th>
                <th>Requested plan</th>
                <th>Submitted</th>
                <th>Verification</th>
                <th>Review</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && filtered.length === 0}
                emptyTitle="No onboarding requests"
                emptyDescription="Submitted tenant applications will appear here."
                onRetry={refetch}
              >
                {filtered.map((row) => (
                  <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => setOpen(row)}>
                    <td>
                      <div className="tenant-name-cell">
                        <span className={`tenant-avatar ${avatarToneFor(row.id)}`}>{initialsFor(row.company_name)}</span>
                        <span><strong>{row.company_name}</strong><small>ID #{row.id}</small></span>
                      </div>
                    </td>
                    <td>
                      <div><strong style={{ fontSize: 11, color: "var(--gray-700)" }}>{row.email}</strong></div>
                      {row.phone && <small style={{ color: "var(--gray-400)", fontSize: 9 }}>{row.phone}</small>}
                    </td>
                    <td><span className={`plan-badge plan-${planFromRequest(row).toLowerCase()}`}>{planFromRequest(row)}</span></td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{verificationPill(deriveVerification(row))}</td>
                    <td>{reviewPill(row)}</td>
                    <td><button className="icon-button subtle" type="button" aria-label={`Actions for ${row.company_name}`} onClick={(e) => e.stopPropagation()}><DotsVertical /></button></td>
                  </tr>
                ))}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      <RefSidePanel
        open={!!open}
        title={open?.company_name ?? ""}
        subtitle={open ? `Submitted ${formatDate(open.created_at)} · ${planFromRequest(open)}` : ""}
        onClose={() => setOpen(null)}
        actions={
          <>
            <RefButton variant="secondary" disabled={!!busy} onClick={() => open && handleReject(open)}>Reject</RefButton>
            <RefButton variant="primary" disabled={!!busy} onClick={() => open && handleApprove(open)}>
              {busy === "approve" ? "Approving…" : "Approve & provision"}
            </RefButton>
          </>
        }
      >
        {open && (
          <>
            <h4>Company</h4>
            <dl>
              <dt>Organization</dt><dd>{open.company_name}</dd>
              <dt>Email</dt><dd>{open.email}</dd>
              <dt>Phone</dt><dd>{open.phone || "—"}</dd>
              <dt>Plan requested</dt><dd><span className={`plan-badge plan-${planFromRequest(open).toLowerCase()}`}>{planFromRequest(open)}</span></dd>
              <dt>Submitted</dt><dd>{formatDate(open.created_at)}</dd>
            </dl>
            {open.notes && (
              <>
                <h4>Notes</h4>
                <p>{open.notes}</p>
              </>
            )}
            <h4>Status</h4>
            <dl>
              <dt>Review</dt><dd>{reviewPill(open)}</dd>
              <dt>Verification</dt><dd>{verificationPill(deriveVerification(open))}</dd>
            </dl>
          </>
        )}
      </RefSidePanel>

      {toast && <div className="toast"><span><CheckCircle /></span>{toast}</div>}
    </ReferenceShell>
  );
}