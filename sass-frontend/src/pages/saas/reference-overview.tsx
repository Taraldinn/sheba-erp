import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BarChartSquare02,
  Building07,
  ChevronDown,
  CoinsStacked01,
  DotsVertical,
  Plus,
  RefreshCw01,
  SearchLg,
  Server01,
  ShieldTick,
  TrendUp01,
  Users01,
  XClose,
} from "@untitledui/icons";
import { saasApi, type Backup, type DashboardOverview, type OnboardingRequest, type SaaSPlatformHealth, type Tenant } from "@/api/client";
import { ReferenceShell } from "./reference/reference-shell";
import { avatarToneFor, formatRelative, initialsFor } from "./reference/use-api";

type Icon = React.ComponentType<{ className?: string }>;

function Button({ children, icon: IconComponent, variant = "secondary", onClick, className = "", disabled = false }: { children: React.ReactNode; icon?: Icon; variant?: "primary" | "secondary" | "ghost"; onClick?: () => void; className?: string; disabled?: boolean; }) {
  return (
    <button className={`button button-${variant} ${className}`} type="button" onClick={onClick} disabled={disabled}>
      {IconComponent && <IconComponent className="button-icon" />}
      {children}
    </button>
  );
}

function MetricCard({ label, value, change, helper, icon: IconComp, tone }: { label: string; value: string; change?: string; helper?: string; icon: Icon; tone: string }) {
  return (
    <article className="card metric-card">
      <div className="metric-top">
        <div className={`metric-icon metric-icon-${tone}`}><IconComp /></div>
        <button className="icon-button subtle" type="button" aria-label={`More options for ${label}`}><DotsVertical /></button>
      </div>
      <p className="metric-label">{label}</p>
      <div className="metric-value-row">
        <strong>{value}</strong>
        {change && <span className="positive"><ArrowUpRight />{change}</span>}
      </div>
      {helper && <p className="metric-helper">{helper}</p>}
    </article>
  );
}

function RevenueChart({ range }: { range: string }) {
  return (
    <div className="chart-wrap" aria-label={`Revenue chart for ${range}`}>
      <div className="y-axis">
        <span>$60k</span><span>$45k</span><span>$30k</span><span>$15k</span><span>$0</span>
      </div>
      <div className="chart">
        <div className="chart-grid"><i /><i /><i /><i /><i /></div>
        <svg viewBox="0 0 720 220" preserveAspectRatio="none" role="img" aria-label="Revenue trend across the selected period">
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-500)" stopOpacity=".25" />
              <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-area" d="M0 172 C55 160 85 150 120 157 S190 140 240 122 S315 136 360 103 S430 87 480 92 S555 73 600 63 S670 48 720 31 L720 220 L0 220 Z" />
          <path className="chart-line" d="M0 172 C55 160 85 150 120 157 S190 140 240 122 S315 136 360 103 S430 87 480 92 S555 73 600 63 S670 48 720 31" />
          <line className="chart-guide" x1="600" y1="0" x2="600" y2="220" />
          <circle className="chart-point-outer" cx="600" cy="63" r="7" />
          <circle className="chart-point" cx="600" cy="63" r="3" />
        </svg>
        <div className="chart-tooltip">
          <span>Sep 2026</span>
          <strong>$49,860</strong>
          <small><TrendUp01 /> +8.4%</small>
        </div>
        <div className="x-axis">
          <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
          <span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
        </div>
      </div>
    </div>
  );
}

function PlanDistribution({ tenants }: { tenants: Tenant[] }) {
  const counts = useMemo(() => {
    const out: Record<string, number> = { Enterprise: 0, Growth: 0, Starter: 0 };
    for (const t of tenants) {
      const v = (t.plan || "").toLowerCase();
      if (v.includes("enterprise")) out.Enterprise += 1;
      else if (v.includes("starter")) out.Starter += 1;
      else out.Growth += 1;
    }
    return out;
  }, [tenants]);
  const total = Math.max(1, tenants.length);
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <section className="card distribution-card">
      <div className="card-heading">
        <div>
          <h2>Plan distribution</h2>
          <p>Active tenants by subscription</p>
        </div>
        <button className="icon-button subtle" type="button" aria-label="Plan distribution options"><DotsVertical /></button>
      </div>
      <div className="donut-wrap">
        <div className="donut" aria-label={`Enterprise ${pct(counts.Enterprise)} percent, Growth ${pct(counts.Growth)} percent, Starter ${pct(counts.Starter)} percent`}>
          <div className="donut-center">
            <strong>{tenants.length}</strong>
            <span>Total tenants</span>
          </div>
        </div>
      </div>
      <div className="legend">
        <div><span className="legend-dot enterprise" /><p><strong>Enterprise</strong><small>{counts.Enterprise} tenants</small></p><b>{pct(counts.Enterprise)}%</b></div>
        <div><span className="legend-dot growth" /><p><strong>Growth</strong><small>{counts.Growth} tenants</small></p><b>{pct(counts.Growth)}%</b></div>
        <div><span className="legend-dot starter" /><p><strong>Starter</strong><small>{counts.Starter} tenants</small></p><b>{pct(counts.Starter)}%</b></div>
      </div>
    </section>
  );
}

function TenantTable({ tenants, query, onQueryChange }: { tenants: Tenant[]; query: string; onQueryChange: (q: string) => void }) {
  const filtered = tenants.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="card tenant-card">
      <div className="tenant-card-header">
        <div>
          <h2>Recently active tenants</h2>
          <p>Live usage and billing across your tenant network.</p>
        </div>
        <Button variant="secondary">View all tenants</Button>
      </div>
      <div className="table-toolbar">
        <div className="table-search">
          <SearchLg />
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} aria-label="Search tenants" placeholder="Search tenants" />
        </div>
        <Button variant="secondary" icon={BarChartSquare02}>Export</Button>
      </div>
      <div className="table-scroll ref-table">
        <table>
          <thead>
            <tr><th>Tenant</th><th>Plan</th><th>Contact</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, 6).map((t) => {
              const plan = (t.plan || "Growth").toLowerCase().includes("enterprise") ? "enterprise" : (t.plan || "").toLowerCase().includes("starter") ? "starter" : "growth";
              const status = !t.is_active ? "Suspended" : "Active";
              return (
                <tr key={t.id}>
                  <td>
                    <div className="tenant-name-cell">
                      <span className={`tenant-avatar ${avatarToneFor(t.id)}`}>{initialsFor(t.name)}</span>
                      <span><strong>{t.name}</strong><small>{t.domain_url}</small></span>
                    </div>
                  </td>
                  <td><span className={`plan-badge plan-${plan}`}>{(t.plan || "Growth").replace(" ISP Tier", "")}</span></td>
                  <td>{t.contact_email || "—"}</td>
                  <td><span className={`status-badge status-${status.toLowerCase()}`}><i />{status}</span></td>
                  <td>{formatRelative(t.created_at)}</td>
                  <td><button className="icon-button subtle" type="button" aria-label={`Actions for ${t.name}`}><DotsVertical /></button></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="empty-row">No tenants match “{query}”.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProvisionModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-icon"><Building07 /></div>
        <button className="icon-button modal-close" type="button" aria-label="Close" onClick={onClose}><XClose /></button>
        <h2 id="modal-title">Provision a new tenant</h2>
        <p>Create an isolated workspace and send secure admin access to your customer.</p>
        <label>Organization name<input autoFocus placeholder="e.g. MetroNet Communications" /></label>
        <label>Admin email<input type="email" placeholder="admin@company.com" /></label>
        <label>Subscription plan
          <span className="select-wrap">
            <select defaultValue="Growth" aria-label="Subscription plan">
              <option>Starter</option><option>Growth</option><option>Enterprise</option>
            </select>
            <ChevronDown />
          </span>
        </label>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onClose}>Create tenant</Button>
        </div>
      </div>
    </div>
  );
}

export default function ReferenceOverview() {
  const [range, setRange] = useState("12 months");
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingRequest[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [health, setHealth] = useState<SaaSPlatformHealth | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      setLoadError(null);
      const [ov, tns, onb, bks, hlth] = await Promise.all([
        saasApi.getDashboardOverview(),
        saasApi.getTenants(),
        saasApi.getOnboardingRequests(),
        saasApi.getBackups(),
        saasApi.getPlatformHealth(),
      ]);
      setOverview(ov);
      setTenants(tns);
      setOnboarding(onb);
      setBackups(bks);
      setHealth(hlth);
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load control plane data");
    }
  };

  useEffect(() => { void load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      await load();
      setNotification("Dashboard data is up to date");
    } catch (err: any) {
      setNotification(`Sync failed: ${err?.message ?? "request error"}`);
    } finally {
      setSyncing(false);
      window.setTimeout(() => setNotification(null), 2800);
    }
  };

  const mrr = overview?.mrr ?? 0;
  const totalRevenue = overview?.total_revenue ?? 0;
  const totalTenants = overview?.total_tenants ?? tenants.length;
  const activeSubs = overview?.active_subscriptions ?? 0;
  const pendingOnb = overview?.pending_onboarding ?? onboarding.filter((r) => r.status === "pending").length;
  const completedBackups = backups.filter((b) => b.status === "completed").length;

  return (
    <ReferenceShell active="Overview">
      <div className="page-header">
        <div>
          <p className="eyebrow">Workspace / <span>Overview</span></p>
          <h1>Good morning, Arif</h1>
          <p>Here’s what’s happening across your ISP network today.</p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon={RefreshCw01} onClick={sync} disabled={syncing} className={syncing ? "is-syncing" : ""}>
            {syncing ? "Syncing" : "Sync data"}
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>Provision tenant</Button>
        </div>
      </div>

      {loadError && (
        <div className="ref-state-error" style={{ marginBottom: 12 }} role="alert">
          Couldn't reach the control plane: {loadError}
        </div>
      )}

      <div className="metrics-grid">
        <MetricCard label="Monthly recurring revenue" value={`$${mrr.toLocaleString()}`} icon={CoinsStacked01} tone="purple" helper={`Total revenue: $${totalRevenue.toLocaleString()}`} />
        <MetricCard label="Active tenants" value={totalTenants.toLocaleString()} icon={Building07} tone="blue" helper={`${activeSubs} active subscriptions`} />
        <MetricCard label="Pending onboarding" value={pendingOnb.toLocaleString()} icon={Users01} tone="orange" helper={`${onboarding.length} requests in queue`} />
        <MetricCard label="Snapshots" value={completedBackups.toLocaleString()} icon={Server01} tone="green" helper="Completed backups" />
      </div>

      <div className="analytics-grid">
        <section className="card revenue-card">
          <div className="card-heading revenue-heading">
            <div>
              <h2>Revenue overview</h2>
              <p>Monthly recurring revenue across all active tenants.</p>
            </div>
            <div className="range-tabs" aria-label="Chart time range">
              {["12 months", "30 days", "7 days"].map((item) => (
                <button key={item} type="button" className={range === item ? "range-active" : ""} onClick={() => setRange(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div className="revenue-summary">
            <strong>${mrr.toLocaleString()}</strong>
            <span className="positive"><ArrowUpRight />live</span>
            <small>vs. previous period</small>
          </div>
          <RevenueChart range={range} />
        </section>
        <PlanDistribution tenants={tenants} />
      </div>

      <div className="health-banner">
        <div className="health-icon"><ShieldTick /></div>
        <div className="health-copy">
          <div>
            <strong>Platform health</strong>
            <span className="healthy-badge"><i />{health?.status === "healthy" ? "Healthy" : (health?.status ?? "Unknown")}</span>
          </div>
          <p>Database: {health?.database ?? "—"} · Redis: {health?.redis ?? "—"} · Last checked {health?.timestamp ? formatRelative(health.timestamp) : "—"}</p>
        </div>
        <div className="health-stats">
          <span><small>Active tenants</small><strong>{health?.tenants_active ?? 0} / {health?.tenants_total ?? 0}</strong></span>
          <span><small>Snapshots</small><strong>{completedBackups}</strong></span>
          <span><small>Status</small><strong>{health?.status ?? "—"}</strong></span>
        </div>
        <button className="text-button" type="button" onClick={() => navigate("/platform-health")}>View status <ArrowRight /></button>
      </div>

      <TenantTable tenants={tenants} query={query} onQueryChange={setQuery} />
      <footer>© 2026 ShebaFi Technologies <span>Privacy</span><span>Terms</span><span>System status</span></footer>

      {modalOpen && <ProvisionModal onClose={() => setModalOpen(false)} />}
      {notification && <div className="toast"><span><ShieldTick /></span>{notification}</div>}
    </ReferenceShell>
  );
}
