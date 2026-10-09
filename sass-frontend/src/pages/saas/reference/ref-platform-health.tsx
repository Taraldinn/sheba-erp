import { Activity, Clock, Globe01, Server01, ShieldTick } from "@untitledui/icons";
import { saasApi, type SaaSPlatformHealth } from "@/api/client";
import {
  RefButton,
  RefCard,
  RefMetricGrid,
  RefPageHeader,
  RefStateView,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";
import { formatRelative, useApi } from "./use-api";

function statusTone(s: string): "ok" | "warn" | "down" {
  const v = s.toLowerCase();
  if (v === "healthy" || v === "ok" || v === "connected") return "ok";
  if (v === "down" || v === "failed" || v === "disconnected") return "down";
  return "warn";
}

function HealthTile({ label, value, status }: { label: string; value: string; status: "ok" | "warn" | "down" }) {
  return (
    <div className="ref-tile">
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
      <div className={`ref-tile-dot ${status === "ok" ? "ref-tile-dot-ok" : status === "warn" ? "ref-tile-dot-warn" : "ref-tile-dot-down"}`} />
    </div>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 60},${24 - ((v - min) / span) * 22}`).join(" ");
  return (
    <svg className="ref-spark" viewBox="0 0 60 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function RefPlatformHealthScreen() {
  const { data, loading, error, refetch } = useApi<SaaSPlatformHealth>(() => saasApi.getPlatformHealth());
  const overall = data?.status ?? "loading";
  const dbStatus = data?.database ?? "unknown";
  const redisStatus = data?.redis ?? "unknown";
  const tenantsActive = data?.tenants_active ?? 0;
  const tenantsTotal = data?.tenants_total ?? 0;
  const checked = data?.timestamp ? formatRelative(data.timestamp) : "—";

  return (
    <ReferenceShell active="Platform health">
      <RefPageHeader
        eyebrow="Workspace / Platform health"
        title="Platform health"
        description="Real-time status of every core service, region, and tenant isolation namespace."
        actions={
          <>
            <RefButton variant="secondary" onClick={() => refetch()}>Refresh</RefButton>
            <RefButton variant="primary">Open status page</RefButton>
          </>
        }
      />

      {loading ? (
        <RefStateView loading />
      ) : error ? (
        <RefStateView error={error} onRetry={refetch} />
      ) : (
        <div className="ref-banner-warn" style={{ marginTop: 0, borderColor: overall === "healthy" ? "#abefc6" : undefined, background: overall === "healthy" ? "linear-gradient(90deg, #f6fef9 0%, #fff 60%)" : undefined }}>
          <ShieldTick />
          <div>
            <strong>{overall === "healthy" ? "All systems healthy" : `Platform status: ${overall}`}</strong>
            <div style={{ color: "var(--gray-500)", fontSize: 12 }}>Last checked {checked}.</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <RefMetricGrid
          metrics={[
            { label: "Overall status", value: data ? (overall.charAt(0).toUpperCase() + overall.slice(1)) : "—", icon: ShieldTick, tone: overall === "healthy" ? "green" : "orange" },
            { label: "Tenants active", value: `${tenantsActive} / ${tenantsTotal}`, icon: Activity, tone: "purple" },
            { label: "PostgreSQL", value: dbStatus, icon: Clock, tone: statusTone(dbStatus) === "ok" ? "green" : "orange" },
            { label: "Redis", value: redisStatus, icon: Globe01, tone: statusTone(redisStatus) === "ok" ? "blue" : "orange" },
          ]}
        />
      </div>

      <div className="ref-section-grid" style={{ marginTop: 16 }}>
        <RefCard title="Service latency" description="Aggregated health by service">
          <div className="ref-tile-grid">
            <HealthTile label="API gateway" value="Healthy" status="ok" />
            <HealthTile label="PostgreSQL primary" value={dbStatus} status={statusTone(dbStatus)} />
            <HealthTile label="PostgreSQL replica" value="Healthy" status="ok" />
            <HealthTile label="Redis cluster" value={redisStatus} status={statusTone(redisStatus)} />
            <HealthTile label="Billing worker" value="Watch" status="warn" />
            <HealthTile label="Webhook dispatcher" value="Watch" status="warn" />
          </div>
        </RefCard>
        <RefCard title="Live signals" description="Last 60 minutes (placeholder)">
          <div className="ref-tile-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="ref-tile">
              <div>
                <strong>API requests / min</strong>
                <small>Traffic across all routes</small>
              </div>
              <Spark values={[180, 220, 210, 240, 260, 280, 320, 310, 340, 360, 350, 380]} color="var(--brand-600)" />
            </div>
            <div className="ref-tile">
              <div>
                <strong>Database QPS</strong>
                <small>PostgreSQL primary</small>
              </div>
              <Spark values={[80, 90, 88, 95, 110, 108, 120, 118, 130, 142, 138, 150]} color="var(--success-500)" />
            </div>
            <div className="ref-tile">
              <div>
                <strong>Queue depth</strong>
                <small>Background workers</small>
              </div>
              <Spark values={[12, 18, 22, 30, 26, 28, 40, 60, 55, 50, 48, 42]} color="var(--warning-500)" />
            </div>
          </div>
        </RefCard>
      </div>

      <div className="ref-section-grid" style={{ marginTop: 16 }}>
        <RefCard title="Recent incidents" description="Most recent platform events">
          <div className="table-scroll ref-table">
            <table>
              <thead>
                <tr><th>Time</th><th>Service</th><th>Status</th><th>Summary</th></tr>
              </thead>
              <tbody>
                <tr><td>{checked}</td><td>Control plane</td><td><span className="ref-pill ref-pill-success"><i />Operational</span></td><td>Health check succeeded. {tenantsActive} of {tenantsTotal} tenant namespaces active.</td></tr>
              </tbody>
            </table>
          </div>
        </RefCard>
        <RefCard title="Tenant isolation" description="Namespaces currently in use">
          <div className="ref-tile-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="ref-tile">
              <div>
                <strong>Active namespaces</strong>
                <small>Across the platform</small>
              </div>
              <div className="ref-tile-value">{tenantsActive}</div>
              <div className="ref-tile-dot ref-tile-dot-ok" />
            </div>
            <div className="ref-tile">
              <div>
                <strong>Total provisioned</strong>
                <small>Since launch</small>
              </div>
              <div className="ref-tile-value">{tenantsTotal}</div>
              <div className="ref-tile-dot ref-tile-dot-ok" />
            </div>
          </div>
        </RefCard>
      </div>
    </ReferenceShell>
  );
}