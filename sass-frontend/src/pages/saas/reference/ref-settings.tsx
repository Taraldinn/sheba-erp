import { useState } from "react";
import {
  RefButton,
  RefCard,
  RefPageHeader,
} from "./reference-primitives";
import { ReferenceShell } from "./reference-shell";

type Section = "general" | "security" | "billing" | "notifications" | "integrations";

const SECTIONS: { id: Section; label: string; description: string }[] = [
  { id: "general", label: "General", description: "Workspace name, default locale, and branding." },
  { id: "security", label: "Security", description: "Session length, MFA enforcement, IP allowlists." },
  { id: "billing", label: "Billing", description: "Default payment method, invoice settings, and tax IDs." },
  { id: "notifications", label: "Notifications", description: "Email and webhook targets for platform events." },
  { id: "integrations", label: "Integrations", description: "Connect observability, ticketing, and chat tools." },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--gray-700)", fontSize: 12, fontWeight: 500 }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        style={{
          width: 34, height: 20, borderRadius: 999, border: 0,
          background: checked ? "var(--brand-600)" : "var(--gray-300)",
          position: "relative", cursor: "pointer", transition: "background .15s",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 16 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left .15s",
        }} />
      </button>
    </label>
  );
}

export default function RefSettingsScreen() {
  const [section, setSection] = useState<Section>("general");
  const [mfa, setMfa] = useState(true);
  const [ipAllow, setIpAllow] = useState(false);
  const [webhookFailures, setWebhookFailures] = useState(true);
  const [billingAlerts, setBillingAlerts] = useState(true);

  return (
    <ReferenceShell active="Settings">
      <RefPageHeader
        eyebrow="Workspace / Settings"
        title="Settings"
        description="Configure your ShebaFi platform workspace, security, and integrations."
        actions={<RefButton variant="primary">Save changes</RefButton>}
      />

      <div className="ref-section-grid">
        <RefCard title="Sections" description="Choose a section to edit">
          <div style={{ display: "grid", gap: 6 }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`ref-chip ${section === s.id ? "ref-chip-active" : ""}`}
                style={{ textAlign: "left", padding: "10px 14px", borderRadius: 9, display: "block" }}
              >
                <strong style={{ display: "block", color: "inherit", fontSize: 12 }}>{s.label}</strong>
                <small style={{ color: "var(--gray-500)", fontSize: 10 }}>{s.description}</small>
              </button>
            ))}
          </div>
        </RefCard>

        {section === "general" && (
          <RefCard title="General" description="Workspace name, locale, and branding.">
            <label className="ref-field">Workspace name<input defaultValue="ShebaFi Platform" /></label>
            <label className="ref-field">Default timezone<select defaultValue="Asia/Dhaka"><option>Asia/Dhaka</option><option>UTC</option></select></label>
            <label className="ref-field">Default locale<select defaultValue="en-BD"><option>en-BD</option><option>en-US</option></select></label>
            <label className="ref-field">Support email<input defaultValue="support@shebafi.com" /></label>
          </RefCard>
        )}

        {section === "security" && (
          <RefCard title="Security" description="Session length, MFA, and IP allowlists.">
            <label className="ref-field">Session timeout (minutes)<input type="number" defaultValue={60} /></label>
            <div style={{ marginTop: 12 }}>
              <Toggle checked={mfa} onChange={setMfa} label="Require MFA for super administrators" />
              <Toggle checked={ipAllow} onChange={setIpAllow} label="Restrict super admin login to allowlisted IPs" />
            </div>
            {ipAllow && (
              <label className="ref-field">Allowlisted IPs<textarea defaultValue="103.59.16.0/24\n180.211.34.0/24" /></label>
            )}
          </RefCard>
        )}

        {section === "billing" && (
          <RefCard title="Billing" description="Invoices and tax settings for the platform account.">
            <label className="ref-field">Legal entity name<input defaultValue="ShebaFi Technologies Ltd." /></label>
            <label className="ref-field">Tax ID<input defaultValue="BD-TAX-918273645" /></label>
            <label className="ref-field">Invoice currency<select defaultValue="USD"><option>USD</option><option>BDT</option></select></label>
            <label className="ref-field">Invoice email<input type="email" defaultValue="billing@shebafi.com" /></label>
          </RefCard>
        )}

        {section === "notifications" && (
          <RefCard title="Notifications" description="Email and webhook event routing.">
            <label className="ref-field">Operations email<input type="email" defaultValue="ops@shebafi.com" /></label>
            <label className="ref-field">Slack webhook<input defaultValue="https://hooks.slack.com/services/T0/B0/XXXX" /></label>
            <div style={{ marginTop: 12 }}>
              <Toggle checked={webhookFailures} onChange={setWebhookFailures} label="Notify on webhook delivery failures" />
              <Toggle checked={billingAlerts} onChange={setBillingAlerts} label="Notify on past-due invoices" />
            </div>
          </RefCard>
        )}

        {section === "integrations" && (
          <RefCard title="Integrations" description="Connect external observability and ticketing tools.">
            <div className="ref-tile-grid">
              <div className="ref-tile">
                <div><strong>Grafana</strong><small>Metrics</small></div>
                <div className="ref-tile-value">Connected</div>
                <div className="ref-tile-dot ref-tile-dot-ok" />
              </div>
              <div className="ref-tile">
                <div><strong>Sentry</strong><small>Error tracking</small></div>
                <div className="ref-tile-value">Connected</div>
                <div className="ref-tile-dot ref-tile-dot-ok" />
              </div>
              <div className="ref-tile">
                <div><strong>Zendesk</strong><small>Tenant support</small></div>
                <div className="ref-tile-value">Not connected</div>
                <div className="ref-tile-dot ref-tile-dot-warn" />
              </div>
            </div>
          </RefCard>
        )}
      </div>
    </ReferenceShell>
  );
}