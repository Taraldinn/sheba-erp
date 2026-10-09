import { useState } from "react";
import { Database01, Folder, Plus } from "@untitledui/icons";
import { saasApi, type Backup } from "@/api/client";
import {
  RefButton,
  RefCard,
  RefMetricGrid,
  RefPageHeader,
  RefModal,
  RefStateView,
  RefTableToolbar,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";
import { avatarToneFor, formatRelative, initialsFor, useApi } from "./use-api";

type Status = "Completed" | "Running" | "Failed";

function statusFor(b: Backup): Status {
  const s = (b.status || "").toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "in_progress") return "Running";
  return "Failed";
}

function statusPill(s: Status) {
  const cls = s === "Completed" ? "ref-pill-success" : s === "Running" ? "ref-pill-brand" : "ref-pill-error";
  return <span className={`ref-pill ${cls}`}><i />{s}</span>;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function RefBackupsScreen() {
  const { data, loading, error, refetch } = useApi<Backup[]>(() => saasApi.getBackups());
  const [confirmRun, setConfirmRun] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const backups = data ?? [];
  const completed = backups.filter((b) => statusFor(b) === "Completed");
  const totalBytes = completed.reduce((sum, b) => sum + (b.size_bytes || 0), 0);
  const last = completed[0];
  const totalMB = totalBytes / (1024 * 1024);

  const handleRunBackup = async () => {
    setBusy(true);
    try {
      await saasApi.createBackup("all", "full");
      setToast("Full backup started");
      await refetch();
    } catch (err: any) {
      setToast(`Couldn't start backup: ${err?.message ?? "request failed"}`);
    } finally {
      setBusy(false);
      setConfirmRun(false);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  return (
    <ReferenceShell active="Backups">
      <RefPageHeader
        eyebrow="Workspace / Backups"
        title="Backups"
        description="Schedule, monitor, and restore isolated PostgreSQL snapshots."
        actions={
          <>
            <RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>
            <RefButton variant="primary" icon={Plus} onClick={() => setConfirmRun(true)}>Run backup now</RefButton>
          </>
        }
      />

      <RefMetricGrid
        metrics={[
          { label: "Last successful backup", value: last ? formatRelative(last.created_at) : "—", icon: Database01, tone: "green" },
          { label: "Snapshots", value: completed.length.toLocaleString(), icon: Database01, tone: "purple" },
          { label: "Storage used", value: totalMB > 1024 ? `${(totalMB / 1024).toFixed(2)} GB` : `${totalMB.toFixed(0)} MB`, icon: Database01, tone: "blue" },
          { label: "Retention period", value: "30 days", icon: Folder, tone: "orange" },
        ]}
      />

      <RefCard title="Backup history" description={loading ? "Loading…" : `${backups.length} snapshot(s)`}>
        <RefTableToolbar actions={<RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>} />
        <div className="table-scroll ref-table">
          <table>
            <thead>
              <tr>
                <th>Backup ID</th>
                <th>Scope</th>
                <th>Tenant</th>
                <th>Started</th>
                <th>Size</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <RefStateView
                loading={loading}
                error={error}
                empty={!loading && !error && backups.length === 0}
                emptyTitle="No backups yet"
                emptyDescription="Run a backup to seed the snapshot history."
                onRetry={refetch}
              >
                {backups.map((row) => (
                  <tr key={row.id}>
                    <td><strong style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--gray-700)" }}>{row.id}</strong></td>
                    <td><span className="plan-badge plan-growth">{row.backup_type || "full"}</span></td>
                    <td>
                      <div className="tenant-name-cell">
                        <span className={`tenant-avatar ${avatarToneFor(row.tenant_id)}`}>{initialsFor(row.tenant_name || row.tenant_id)}</span>
                        <span><strong>{row.tenant_name || row.tenant_id}</strong></span>
                      </div>
                    </td>
                    <td>{formatRelative(row.created_at)}</td>
                    <td>{formatBytes(row.size_bytes)}</td>
                    <td>{statusPill(statusFor(row))}</td>
                    <td><RefButton variant="secondary" onClick={() => setRestoreTarget(row)}>Restore</RefButton></td>
                  </tr>
                ))}
              </RefStateView>
            </tbody>
          </table>
        </div>
      </RefCard>

      {confirmRun && (
        <RefModal
          titleId="run-backup"
          title="Run backup now?"
          description="This will create a fresh snapshot of every active tenant. The job runs asynchronously and may take up to 10 minutes."
          icon={Database01}
          primaryLabel="Run backup"
          secondaryLabel="Cancel"
          onPrimary={handleRunBackup}
          primaryDisabled={busy}
          onClose={() => setConfirmRun(false)}
        />
      )}

      {restoreTarget && (
        <RefModal
          titleId="restore-backup"
          title={`Restore ${restoreTarget.id}?`}
          description={`This will overwrite the current ${restoreTarget.tenant_name || restoreTarget.tenant_id} schema. This action cannot be undone.`}
          icon={Database01}
          primaryLabel="Restore snapshot"
          secondaryLabel="Cancel"
          onPrimary={() => { setToast("Restore queued"); setRestoreTarget(null); window.setTimeout(() => setToast(null), 2800); }}
          onClose={() => setRestoreTarget(null)}
        />
      )}

      {toast && <div className="toast"><span><Database01 /></span>{toast}</div>}
    </ReferenceShell>
  );
}