"use client";

import { useState, type FormEvent } from "react";
import { Button, Spinner } from "@heroui/react";

import { api, ApiError } from "@/lib/api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function CreateTenantModal({ isOpen, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [plan, setPlan] = useState("Growth");
  const [maxSubscribers, setMaxSubscribers] = useState(2500);
  const [maxRouters, setMaxRouters] = useState(10);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("sheba1234");
  const [contactPhone, setContactPhone] = useState("+880 1700-000000");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive slug and domain when name changes
  function handleNameChange(val: string) {
    setName(val);
    const derived = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    setSlug(derived);
    setDomain(`${derived}.shebafi.xyz`);
    setAdminUsername(`${derived}_admin`);
    setAdminEmail(`admin@${derived}.net`);
  }

  function handlePlanChange(newPlan: string) {
    setPlan(newPlan);
    if (newPlan === "Starter") {
      setMaxSubscribers(500);
      setMaxRouters(3);
    } else if (newPlan === "Growth") {
      setMaxSubscribers(2500);
      setMaxRouters(10);
    } else {
      setMaxSubscribers(10000);
      setMaxRouters(50);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setError("Company Name and Slug are required.");

      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.post("/tenants/", {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        domain: domain.trim().toLowerCase() || `${slug}.shebafi.xyz`,
        plan,
        max_subscribers: Number(maxSubscribers),
        max_routers: Number(maxRouters),
        admin_username: adminUsername.trim() || `${slug}_admin`,
        admin_email: adminEmail.trim(),
        admin_password: adminPassword || "sheba1234",
        contact_phone: contactPhone.trim(),
      });

      onSuccess();
      onClose();
      // Reset form
      setName("");
      setSlug("");
      setDomain("");
      setAdminPassword("sheba1234");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create tenant.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        aria-label="Close modal backdrop"
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity cursor-default"
        type="button"
        onClick={onClose}
      />

      {/* Modal Dialog matching Reference Image 1 */}
      <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-separator/80 bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-separator/70 pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Create New ISP Tenant
            </h2>
            <p className="text-xs text-muted">
              Provision a complete tenant environment, database schema, and
              admin account.
            </p>
          </div>
          <button
            className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-default/50 hover:text-foreground cursor-pointer"
            type="button"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-danger/10 border border-danger/20 p-3 text-xs text-danger font-medium">
            {error}
          </div>
        )}

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* Section 1: Tenant Information */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Organization Details
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="tenant-name"
                >
                  Tenant Name <span className="text-danger">*</span>
                </label>
                <input
                  required
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
                  id="tenant-name"
                  placeholder="e.g. SpeedNet Fiber"
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="tenant-slug"
                >
                  Subdomain / Slug <span className="text-danger">*</span>
                </label>
                <input
                  required
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs font-mono placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
                  id="tenant-slug"
                  placeholder="e.g. speednet"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-xs font-semibold text-foreground mb-1"
                htmlFor="tenant-domain"
              >
                Primary Domain
              </label>
              <input
                className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs font-mono placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
                id="tenant-domain"
                placeholder="e.g. speednet.shebafi.xyz"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="tenant-plan"
                >
                  Plan Tier
                </label>
                <select
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-2.5 text-xs text-foreground focus:border-foreground focus:outline-none transition-all cursor-pointer"
                  id="tenant-plan"
                  value={plan}
                  onChange={(e) => handlePlanChange(e.target.value)}
                >
                  <option value="Starter">Starter (500 subs)</option>
                  <option value="Growth">Growth (2,500 subs)</option>
                  <option value="Enterprise">Enterprise (10,000+ subs)</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="max-subscribers"
                >
                  Max Subscribers
                </label>
                <input
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs text-foreground focus:border-foreground focus:outline-none transition-all"
                  id="max-subscribers"
                  type="number"
                  value={maxSubscribers}
                  onChange={(e) => setMaxSubscribers(Number(e.target.value))}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="max-routers"
                >
                  Max Routers
                </label>
                <input
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs text-foreground focus:border-foreground focus:outline-none transition-all"
                  id="max-routers"
                  type="number"
                  value={maxRouters}
                  onChange={(e) => setMaxRouters(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-separator/60 my-1" />

          {/* Section 2: Initial Admin Account */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Initial ISP Administrator
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="admin-username"
                >
                  Admin Username
                </label>
                <input
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs font-mono placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
                  id="admin-username"
                  placeholder="e.g. speednet_admin"
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="admin-password"
                >
                  Admin Password
                </label>
                <input
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs font-mono focus:border-foreground focus:outline-none transition-all"
                  id="admin-password"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="admin-email"
                >
                  Contact Email
                </label>
                <input
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
                  id="admin-email"
                  placeholder="admin@speednet.net"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold text-foreground mb-1"
                  htmlFor="contact-phone"
                >
                  Contact Phone
                </label>
                <input
                  className="w-full h-9 rounded-xl border border-separator/80 bg-surface-secondary/40 px-3 text-xs placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
                  id="contact-phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons matching Reference Image 1 */}
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-separator/70 pt-4">
            <button
              className="rounded-full px-4 py-2 text-xs font-semibold text-foreground hover:bg-default/50 transition-colors cursor-pointer"
              type="button"
              onClick={onClose}
            >
              Discard
            </button>
            <Button
              className="rounded-full bg-accent text-accent-foreground px-5 py-2 text-xs font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer"
              isDisabled={submitting}
              type="submit"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" /> Provisioning…
                </span>
              ) : (
                "Provision Tenant"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
