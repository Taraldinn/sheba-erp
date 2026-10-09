import { useMemo, useState } from "react";
import { ShieldTick } from "@untitledui/icons";
import { saasApi, type AuditLog } from "@/api/client";
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

function resultPill(r: AuditLog["details"] extends infer D ? D extends { result?: infer X } ? X : never : never) {
  if (r === "failure" || r === false) return <span className="ref-pill ref-pill-error"><i />Failure</span>;
  return <span className="ref-pill ref-pill-success"><i />Success</span>;
}

function isSuccess(d: any): boolean {
  if (!d) return true;
  if (typeof d.result === "string") return d.result.toLowerCase() !== "failure" && d.result.toLowerCase() !== "fail";
  if (typeof d.success === "boolean") return d.success;
  return true;
}

const FILTERS: { id: "all" | "success" | "failure"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "success", label: "Success" },
  { id: "failure", label: "Failure" },
];

export default function RefAuditLogsScreen() {
  const { data, loading, error, refetch } = useApi<AuditLog[]>(() => saasApi.getAuditLogs());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "success" | "failure">("all");
  const [open, setOpen] = useState<AuditLog | null>(null);

  const logs = data ?? [];
  const filtered = useMemo(() => logs.filter((l) => {
    const q = !query || l.action.toLowerCase().includes(query.toLowerCase()) || l.user_id.toLowerCase().includes(query.toLowerCase());
    const f = filter === "all" || (filter === "success" ? isSuccess(l.details) : !isSuccess(l.details));
    return q && f;
  }), [logs, query, filter]);

  const total = logs.length;
  const failures = logs.filter((l) => !isSuccess(l.details)).length;
  const uniqueActors = new Set(logs.map((l) => l.user_id)).size;

  return (
    <ReferenceShell active="Audit logs">
      <RefPageHeader
        eyebrow="Workspace / Audit logs"
        title="Audit logs"
        description="Every administrative action across the ShebaFi platform, with diffs and actor context."
        actions={
          <>
            <RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>
            <RefButton variant="primary">Export</RefButton>
          </>
        }
      />

      <RefMetricGrid
        metrics={[
          { label: "Events", value: total.toLocaleString(), icon: ShieldTick, tone: "purple" },
          { label: "Failures", value: failures.toLocaleString(), icon: ShieldTick, tone: "orange" },
          { label: "Unique actors", value: uniqueActors.toLocaleString(), icon: ShieldTick, tone: "blue" },
          { label: "MFA-protected", value: "100%", icon: ShieldTick, tone: "green" },
        ]}
      />

      <RefCard title="Audit trail" description={loading ? "Loading…" : `${filtered.length} of ${total} matching`}>
        <RefTableToolbar
          searchPlaceholder="Search by actor or action"
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
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Tenant</th>
                <th>IP</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && filtered.length === 0}
                emptyTitle="No audit entries"
                emptyDescription="Once administrators take actions, they appear here."
                onRetry={refetch}
              >
                {filtered.map((row) => (
                  <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => setOpen(row)}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <div className="tenant-name-cell">
                        <span className={`tenant-avatar ${avatarToneFor(row.user_id)}`}>{initialsFor(row.user_id)}</span>
                        <span><strong>{row.user_id}</strong></span>
                      </div>
                    </td>
                    <td><code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--gray-700)" }}>{row.action}</code></td>
                    <td>{row.tenant_id || "—"}</td>
                    <td>{row.ip_address || "—"}</td>
                    <td>{isSuccess(row.details)
                      ? <span className="ref-pill ref-pill-success"><i />Success</span>
                      : <span className="ref-pill ref-pill-error"><i />Failure</span>}
                    </td>
                  </tr>
                ))}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      <RefSidePanel
        open={!!open}
        title={open ? open.action : ""}
        subtitle={open ? `${formatDate(open.created_at)} · ${open.user_id}` : ""}
        onClose={() => setOpen(null)}
        actions={<RefButton variant="primary" onClick={() => setOpen(null)}>Close</RefButton>}
      >
        {open && (
          <>
            <h4>Context</h4>
            <dl>
              <dt>Actor</dt><dd>{open.user_id}</dd>
              <dt>Action</dt><dd><code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{open.action}</code></dd>
              <dt>Tenant</dt><dd>{open.tenant_id || "—"}</dd>
              <dt>IP</dt><dd>{open.ip_address || "—"}</dd>
              <dt>Result</dt><dd>{isSuccess(open.details)
                ? <span className="ref-pill ref-pill-success"><i />Success</span>
                : <span className="ref-pill ref-pill-error"><i />Failure</span>}
              </dd>
            </dl>
            {open.details && Object.keys(open.details).length > 0 && (
              <>
                <h4>Payload</h4>
                <pre style={{
                  background: "var(--gray-25)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 11,
                  color: "var(--gray-700)",
                  overflow: "auto",
                  margin: 0,
                }}>{JSON.stringify(open.details, null, 2)}</pre>
              </>
            )}
          </>
        )}
      </RefSidePanel>
    </ReferenceShell>
  );
}