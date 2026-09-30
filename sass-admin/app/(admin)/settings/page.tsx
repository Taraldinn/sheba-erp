"use client";

/**
 * Platform-wide settings page. The backend exposes CompanySetting records
 * via `/settings/` — one per tenant. We display the platform owner's row
 * (first record) and let them edit fields that the control plane exposes.
 */

import { useEffect, useState } from "react";
import { Alert, Button, Chip, Spinner } from "@heroui/react";

import { api, ApiError } from "@/lib/api";
import { ResourceFormModal } from "@/components/resource-form-modal";
import { type ResourceFormConfig } from "@/lib/resource-config";

type CompanySetting = {
  id?: string | number;
  tenant?: string | number;
  company_name?: string;
  tagline?: string;
  client_name?: string;
  currency_symbol?: string;
  currency_code?: string;
  invoice_prefix?: string;
  customer_id_prefix?: string;
  support_phone?: string;
  support_email?: string;
  website?: string;
  address?: string;
  tax_number?: string;
  billing_footer_note?: string;
  logo_url?: string;
  favicon_url?: string;
  theme_mode?: string;
  accent_color?: string;
  payment_tutorial_video?: string;
  funbox_live_tv_enabled?: boolean;
  funbox_live_tv_url?: string;
  funbox_movie_server_enabled?: boolean;
  funbox_movie_server_url?: string;
  [k: string]: unknown;
};

const settingsForm: ResourceFormConfig = {
  canCreate: false,
  canDelete: false,
  fields: [
    { name: "company_name", label: "Company name", required: true },
    { name: "tagline", label: "Tagline" },
    { name: "client_name", label: "Client / owner name" },
    {
      name: "currency_code",
      label: "Currency code",
      helpText: "ISO 4217, e.g. BDT, USD, INR.",
    },
    {
      name: "currency_symbol",
      label: "Currency symbol",
      placeholder: "৳",
    },
    { name: "invoice_prefix", label: "Invoice prefix" },
    { name: "customer_id_prefix", label: "Customer ID prefix" },
    { name: "support_phone", label: "Support phone" },
    {
      name: "support_email",
      label: "Support email",
      type: "email",
    },
    { name: "website", label: "Website", type: "url" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "tax_number", label: "Tax number" },
    {
      name: "billing_footer_note",
      label: "Invoice footer",
      type: "textarea",
    },
    {
      name: "theme_mode",
      label: "Theme mode",
      type: "select",
      options: [
        { label: "Dark glassmorphic (default)", value: "dark" },
        { label: "Clean light mode", value: "light" },
        { label: "System default", value: "system" },
        { label: "Midnight deep blue", value: "midnight" },
        { label: "Cyber neon", value: "cyberpunk" },
      ],
    },
    {
      name: "accent_color",
      label: "Accent color",
      type: "select",
      options: [
        { label: "Electric indigo", value: "indigo" },
        { label: "Emerald", value: "emerald" },
        { label: "Rose", value: "rose" },
        { label: "Amber", value: "amber" },
      ],
    },
    { name: "logo_url", label: "Logo URL" },
    { name: "favicon_url", label: "Favicon URL" },
    {
      name: "payment_tutorial_video",
      label: "Payment tutorial video",
      type: "url",
    },
  ],
};

function isPaginated(payload: unknown): payload is { results: CompanySetting[] } {
  return (
    !!payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { results?: unknown }).results)
  );
}

export default function SettingsPage() {
  const [record, setRecord] = useState<CompanySetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<unknown>("/settings/");
      const list = isPaginated(data) ? data.results : Array.isArray(data) ? data : [];

      setRecord((list[0] as CompanySetting) ?? null);
    } catch (err) {
      if (err instanceof ApiError) setError(`${err.status} ${err.message}`);
      else setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(payload: Record<string, unknown>) {
    if (!record?.id) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.patch(`/settings/${record.id}/`, payload);
      setEditorOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setSaveError(`${err.status} ${err.message}`);
      else setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Platform settings
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Branding, billing defaults, and theme controls applied across the control plane.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="rounded-full text-xs font-semibold"
            isDisabled={loading || !record}
            size="sm"
            variant="primary"
            onPress={() => setEditorOpen(true)}
          >
            Edit settings
          </Button>
          <Button
            className="rounded-full text-xs font-semibold"
            isDisabled={loading}
            size="sm"
            variant="tertiary"
            onPress={() => void load()}
          >
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <Alert status="danger" title="Couldn't load settings">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-separator/80 bg-surface text-xs text-muted">
          <Spinner size="md" />
          <span>Loading platform settings…</span>
        </div>
      ) : !record ? (
        <Alert status="warning" title="No settings yet">
          The platform owner has not configured CompanySetting yet. Once the SaaS
          onboarding flow creates one, it'll show up here.
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsSection title="Company profile">
            <Row label="Company name" value={record.company_name} />
            <Row label="Tagline" value={record.tagline} />
            <Row label="Owner" value={record.client_name} />
            <Row label="Tax number" value={record.tax_number} />
          </SettingsSection>

          <SettingsSection title="Billing defaults">
            <Row label="Currency" value={`${record.currency_symbol ?? ""} ${record.currency_code ?? ""}`.trim()} />
            <Row label="Invoice prefix" value={record.invoice_prefix} />
            <Row label="Customer ID prefix" value={record.customer_id_prefix} />
            <Row
              label="Support"
              value={`${record.support_phone ?? "—"} · ${record.support_email ?? "—"}`}
            />
          </SettingsSection>

          <SettingsSection title="Theme">
            <div className="flex items-center gap-2">
              <Chip color="accent" size="sm" variant="soft">
                {record.theme_mode ?? "dark"}
              </Chip>
              <Chip color="default" size="sm" variant="soft">
                {record.accent_color ?? "indigo"}
              </Chip>
            </div>
            <Row label="Logo URL" value={record.logo_url} />
            <Row label="Favicon URL" value={record.favicon_url} />
          </SettingsSection>

          <SettingsSection title="Funbox integrations">
            <Row
              label="Live TV"
              value={
                record.funbox_live_tv_enabled
                  ? record.funbox_live_tv_url ?? "Enabled"
                  : "Disabled"
              }
            />
            <Row
              label="Movie server"
              value={
                record.funbox_movie_server_enabled
                  ? record.funbox_movie_server_url ?? "Enabled"
                  : "Disabled"
              }
            />
          </SettingsSection>
        </div>
      )}

      {editorOpen && record && (
        <ResourceFormModal
          description="Update branding and billing defaults. Changes apply across the SaaS control plane."
          error={saveError}
          fields={settingsForm.fields}
          initialValues={record}
          mode="edit"
          open
          busy={saving}
          title="Platform settings"
          onCancel={() => {
            if (!saving) {
              setEditorOpen(false);
              setSaveError(null);
            }
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-separator/80 bg-surface p-5 shadow-xs">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-xs font-semibold text-foreground">
        {value && value.trim() ? value : "—"}
      </span>
    </div>
  );
}
