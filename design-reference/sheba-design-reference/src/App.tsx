import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChartSquare02,
  Bell01,
  Building07,
  ChevronDown,
  Clock,
  CoinsStacked01,
  CreditCard01,
  DotsVertical,
  Folder,
  HomeLine,
  LayersThree01,
  LifeBuoy01,
  LogOut01,
  Menu01,
  Moon01,
  Plus,
  RefreshCw01,
  SearchLg,
  Server01,
  Settings01,
  ShieldTick,
  Sun,
  TrendUp01,
  Users01,
  XClose,
} from "@untitledui/icons";

type Icon = ComponentType<{ className?: string }>;

type Tenant = {
  name: string;
  domain: string;
  initials: string;
  plan: "Enterprise" | "Growth" | "Starter";
  subscribers: string;
  revenue: string;
  status: "Active" | "Pending";
  color: string;
};

const tenants: Tenant[] = [
  {
    name: "Link3 Technologies",
    domain: "link3.shebafi.com",
    initials: "LT",
    plan: "Enterprise",
    subscribers: "8,492",
    revenue: "$18,240",
    status: "Active",
    color: "avatar-purple",
  },
  {
    name: "Amber IT",
    domain: "amberit.shebafi.com",
    initials: "AI",
    plan: "Growth",
    subscribers: "5,128",
    revenue: "$12,860",
    status: "Active",
    color: "avatar-blue",
  },
  {
    name: "Circle Network",
    domain: "circle.shebafi.com",
    initials: "CN",
    plan: "Growth",
    subscribers: "3,864",
    revenue: "$9,650",
    status: "Active",
    color: "avatar-green",
  },
  {
    name: "Dot Internet",
    domain: "dot.shebafi.com",
    initials: "DI",
    plan: "Starter",
    subscribers: "1,240",
    revenue: "$3,100",
    status: "Pending",
    color: "avatar-orange",
  },
];

const navigation: { label: string; icon: Icon; badge?: string; section?: string }[] = [
  { label: "Overview", icon: HomeLine },
  { label: "Tenants", icon: Building07 },
  { label: "Onboarding", icon: Users01, badge: "4" },
  { label: "Domains", icon: LayersThree01 },
  { label: "Plans & billing", icon: CreditCard01, section: "Management" },
  { label: "Payments", icon: CoinsStacked01 },
  { label: "Backups", icon: Folder },
  { label: "Audit logs", icon: ShieldTick, section: "System" },
  { label: "Platform health", icon: Server01 },
  { label: "Settings", icon: Settings01 },
];

const metrics: { label: string; value: string; change: string; helper: string; icon: Icon; tone: string }[] = [
  {
    label: "Monthly recurring revenue",
    value: "$53,240",
    change: "12.5%",
    helper: "vs. last month",
    icon: CoinsStacked01,
    tone: "purple",
  },
  {
    label: "Active tenants",
    value: "248",
    change: "8.2%",
    helper: "20 added this month",
    icon: Building07,
    tone: "blue",
  },
  {
    label: "Total subscribers",
    value: "26,432",
    change: "4.8%",
    helper: "1,210 new subscribers",
    icon: Users01,
    tone: "green",
  },
  {
    label: "Routers online",
    value: "1,842",
    change: "99.7%",
    helper: "6 routers need attention",
    icon: Server01,
    tone: "orange",
  },
];

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <div className="brand-name">ShebaFi</div>
        <div className="brand-subtitle">Control plane</div>
      </div>
    </div>
  );
}

function Button({
  children,
  icon: IconComponent,
  variant = "secondary",
  onClick,
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  icon?: Icon;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {IconComponent && <IconComponent className="button-icon" />}
      {children}
    </button>
  );
}

function Sidebar({
  active,
  onSelect,
  open,
  onClose,
}: {
  active: string;
  onSelect: (label: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && <button className="sidebar-overlay" aria-label="Close menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand-row">
          <Brand />
          <button className="icon-button mobile-only" type="button" aria-label="Close menu" onClick={onClose}>
            <XClose />
          </button>
        </div>

        <div className="sidebar-search">
          <SearchLg />
          <input aria-label="Search navigation" placeholder="Search" />
          <span>⌘K</span>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {navigation.map((item, index) => (
            <div key={item.label}>
              {(index === 0 || item.section) && (
                <div className={index === 0 ? "nav-section nav-section-first" : "nav-section"}>{item.section || "Workspace"}</div>
              )}
              <button
                type="button"
                className={`nav-item ${active === item.label ? "nav-item-active" : ""}`}
                onClick={() => {
                  onSelect(item.label);
                  onClose();
                }}
              >
                <item.icon className="nav-icon" />
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="support-card" type="button">
            <span className="support-icon"><LifeBuoy01 /></span>
            <span>
              <strong>Need help?</strong>
              <small>Visit the help center</small>
            </span>
            <ArrowRight className="support-arrow" />
          </button>
          <div className="profile">
            <div className="profile-avatar">AR</div>
            <div className="profile-copy">
              <strong>Arif Rahman</strong>
              <span>Super administrator</span>
            </div>
            <button className="icon-button" type="button" aria-label="Sign out">
              <LogOut01 />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function MetricCard({ metric }: { metric: (typeof metrics)[number] }) {
  return (
    <article className="card metric-card">
      <div className="metric-top">
        <div className={`metric-icon metric-icon-${metric.tone}`}>
          <metric.icon />
        </div>
        <button className="icon-button subtle" type="button" aria-label={`More options for ${metric.label}`}>
          <DotsVertical />
        </button>
      </div>
      <p className="metric-label">{metric.label}</p>
      <div className="metric-value-row">
        <strong>{metric.value}</strong>
        <span className="positive"><ArrowUpRight />{metric.change}</span>
      </div>
      <p className="metric-helper">{metric.helper}</p>
    </article>
  );
}

function RevenueChart({ range }: { range: string }) {
  return (
    <div className="chart-wrap" aria-label={`Revenue chart for ${range}`}>
      <div className="y-axis">
        <span>$60k</span>
        <span>$45k</span>
        <span>$30k</span>
        <span>$15k</span>
        <span>$0</span>
      </div>
      <div className="chart">
        <div className="chart-grid"><i /><i /><i /><i /><i /></div>
        <svg viewBox="0 0 720 220" preserveAspectRatio="none" role="img" aria-label="Revenue increased from 31 thousand to 53 thousand dollars">
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

function PlanDistribution() {
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
        <div className="donut" aria-label="Enterprise 36 percent, Growth 44 percent, Starter 20 percent">
          <div className="donut-center">
            <strong>248</strong>
            <span>Total tenants</span>
          </div>
        </div>
      </div>
      <div className="legend">
        <div><span className="legend-dot enterprise" /><p><strong>Enterprise</strong><small>89 tenants</small></p><b>36%</b></div>
        <div><span className="legend-dot growth" /><p><strong>Growth</strong><small>109 tenants</small></p><b>44%</b></div>
        <div><span className="legend-dot starter" /><p><strong>Starter</strong><small>50 tenants</small></p><b>20%</b></div>
      </div>
    </section>
  );
}

function TenantTable({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const filtered = useMemo(
    () => tenants.filter((tenant) => tenant.name.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

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
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} aria-label="Search tenants" placeholder="Search tenants" />
        </div>
        <Button variant="secondary" icon={BarChartSquare02}>Export</Button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Plan</th>
              <th>Subscribers</th>
              <th>Monthly revenue</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tenant) => (
              <tr key={tenant.name}>
                <td>
                  <div className="tenant-name-cell">
                    <span className={`tenant-avatar ${tenant.color}`}>{tenant.initials}</span>
                    <span><strong>{tenant.name}</strong><small>{tenant.domain}</small></span>
                  </div>
                </td>
                <td><span className={`plan-badge plan-${tenant.plan.toLowerCase()}`}>{tenant.plan}</span></td>
                <td>{tenant.subscribers}</td>
                <td className="revenue-cell">{tenant.revenue}</td>
                <td><span className={`status-badge status-${tenant.status.toLowerCase()}`}><i />{tenant.status}</span></td>
                <td><button className="icon-button subtle" type="button" aria-label={`Actions for ${tenant.name}`}><DotsVertical /></button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="empty-row">No tenants match “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProvisionModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-icon"><Building07 /></div>
        <button className="icon-button modal-close" type="button" aria-label="Close" onClick={onClose}><XClose /></button>
        <h2 id="modal-title">Provision a new tenant</h2>
        <p>Create an isolated workspace and send secure admin access to your customer.</p>
        <label>
          Organization name
          <input autoFocus placeholder="e.g. MetroNet Communications" />
        </label>
        <label>
          Admin email
          <input type="email" placeholder="admin@company.com" />
        </label>
        <label>
          Subscription plan
          <span className="select-wrap">
            <select defaultValue="Growth" aria-label="Subscription plan">
              <option>Starter</option>
              <option>Growth</option>
              <option>Enterprise</option>
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

export default function App() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [range, setRange] = useState("12 months");
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem("sheba-theme");
    return savedTheme ? savedTheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("sheba-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const sync = () => {
    setSyncing(true);
    window.setTimeout(() => {
      setSyncing(false);
      setNotification("Dashboard data is up to date");
      window.setTimeout(() => setNotification(null), 2600);
    }, 850);
  };

  return (
    <div className="app-shell">
      <Sidebar active={activeNav} onSelect={setActiveNav} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu01 />
          </button>
          <div className="mobile-brand"><Brand /></div>
          <div className="topbar-actions">
            <div className="system-status"><i /> All systems operational</div>
            <button
              className="icon-button theme-button"
              type="button"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setDarkMode((current) => !current)}
            >
              {darkMode ? <Sun /> : <Moon01 />}
            </button>
            <button className="icon-button notification-button" type="button" aria-label="Notifications" onClick={() => setNotification("You have 3 new notifications")}>
              <Bell01 /><span />
            </button>
            <div className="topbar-divider" />
            <button className="workspace-switcher" type="button">
              <span className="workspace-logo">SF</span>
              <span><strong>ShebaFi Platform</strong><small>Production</small></span>
              <ChevronDown />
            </button>
          </div>
        </header>

        <div className="content">
          <div className="page-header">
            <div>
              <p className="eyebrow">Workspace / <span>{activeNav}</span></p>
              <h1>{activeNav === "Overview" ? "Good morning, Arif" : activeNav}</h1>
              <p>{activeNav === "Overview" ? "Here’s what’s happening across your ISP network today." : `Manage ${activeNav.toLowerCase()} across the ShebaFi platform.`}</p>
            </div>
            <div className="page-actions">
              <Button variant="secondary" icon={RefreshCw01} onClick={sync} disabled={syncing} className={syncing ? "is-syncing" : ""}>
                {syncing ? "Syncing" : "Sync data"}
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>Provision tenant</Button>
            </div>
          </div>

          <div className="metrics-grid">
            {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
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
                <strong>$53,240</strong>
                <span className="positive"><ArrowUpRight />12.5%</span>
                <small>vs. previous period</small>
              </div>
              <RevenueChart range={range} />
            </section>
            <PlanDistribution />
          </div>

          <div className="health-banner">
            <div className="health-icon"><ShieldTick /></div>
            <div className="health-copy">
              <div><strong>Platform health</strong><span className="healthy-badge"><i />Healthy</span></div>
              <p>All core services are operating normally. Last checked 2 minutes ago.</p>
            </div>
            <div className="health-stats">
              <span><small>API uptime</small><strong>99.99%</strong></span>
              <span><small>Avg. latency</small><strong>82ms</strong></span>
              <span><small>Active regions</small><strong>3 / 3</strong></span>
            </div>
            <button className="text-button" type="button">View status <ArrowRight /></button>
          </div>

          <TenantTable query={query} onQueryChange={setQuery} />
          <footer>© 2026 ShebaFi Technologies <span>Privacy</span><span>Terms</span><span>System status</span></footer>
        </div>
      </main>

      {modalOpen && <ProvisionModal onClose={() => setModalOpen(false)} />}
      {notification && <div className="toast"><span><ShieldTick /></span>{notification}</div>}
    </div>
  );
}
