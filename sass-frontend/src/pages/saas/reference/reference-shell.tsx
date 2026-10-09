import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowRight,
  Bell01,
  Building07,
  ChevronDown,
  CoinsStacked01,
  CreditCard01,
  Folder,
  HomeLine,
  LayersThree01,
  LifeBuoy01,
  LogOut01,
  Menu01,
  Moon01,
  SearchLg,
  Server01,
  Settings01,
  ShieldTick,
  Sun,
  Users01,
  XClose,
} from "@untitledui/icons";

const NAV = [
  { label: "Overview", icon: HomeLine, to: "/" },
  { label: "Tenants", icon: Building07, to: "/tenants" },
  { label: "Onboarding", icon: Users01, badge: "4", to: "/onboarding" },
  { label: "Domains", icon: LayersThree01, to: "/domains" },
  { label: "Plans & billing", icon: CreditCard01, section: "Management", to: "/plans" },
  { label: "Payments", icon: CoinsStacked01, to: "/payments" },
  { label: "Backups", icon: Folder, to: "/backups" },
  { label: "Audit logs", icon: ShieldTick, section: "System", to: "/audit-logs" },
  { label: "Platform health", icon: Server01, to: "/platform-health" },
  { label: "Settings", icon: Settings01, to: "/settings" },
] as const;

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

export interface ReferenceShellProps {
  children: React.ReactNode;
  /** Active nav item label (defaults to "/"). */
  active?: string;
  /** Notification toast text; auto-clears after 2.6 s. */
  notification?: string | null;
  onClearNotification?: () => void;
  /** Optional explicit sign-out handler. */
  onSignOut?: () => void;
}

export function ReferenceShell({ children, active, onSignOut }: ReferenceShellProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = window.localStorage.getItem("sheba-theme");
    if (saved === "dark" || saved === "light") return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("sheba-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const activeLabel = active ?? NAV.find((n) => n.to === location.pathname)?.label ?? "Overview";

  const handleSelect = (to: string) => {
    navigate(to);
  };

  const handleSignOut = () => {
    if (onSignOut) onSignOut();
    else navigate("/login");
  };

  return (
    <div className="ref-app" data-theme={darkMode ? "dark" : "light"}>
      <div className="app-shell">
        {mobileOpen && <button className="sidebar-overlay" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
        <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
          <div className="sidebar-brand-row">
            <Brand />
            <button className="icon-button mobile-only" type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
              <XClose />
            </button>
          </div>

          <div className="sidebar-search">
            <SearchLg />
            <input aria-label="Search navigation" placeholder="Search" />
            <span>⌘K</span>
          </div>

          <nav className="nav" aria-label="Main navigation">
            {NAV.map((item, index) => (
              <div key={item.label}>
                {(index === 0 || "section" in item) && (
                  <div className={index === 0 ? "nav-section nav-section-first" : "nav-section"}>
                    {"section" in item ? item.section : "Workspace"}
                  </div>
                )}
                <button
                  type="button"
                  className={`nav-item ${activeLabel === item.label ? "nav-item-active" : ""}`}
                  onClick={() => handleSelect(item.to)}
                >
                  <item.icon className="nav-icon" />
                  <span>{item.label}</span>
                  {"badge" in item && item.badge && <span className="nav-badge">{item.badge}</span>}
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
              <button className="icon-button" type="button" aria-label="Sign out" onClick={handleSignOut}>
                <LogOut01 />
              </button>
            </div>
          </div>
        </aside>

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
              <button className="icon-button notification-button" type="button" aria-label="Notifications">
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

          <div className="content">{children}</div>
        </main>
      </div>
    </div>
  );
}