import type { ReactNode, ComponentType } from "react";
import { DotsVertical, XClose } from "@untitledui/icons";

type Icon = ComponentType<{ className?: string }>;

/* ────────────────────────────────────────────────────────────────────────────
 * Page header (eyebrow + title + description + buttons)
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefPageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function RefPageHeader({ eyebrow, title, description, actions }: RefPageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Button (matches the reference's button styles)
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefButtonProps {
  children: ReactNode;
  icon?: Icon;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  ariaLabel?: string;
}

export function RefButton({
  children,
  icon: IconComponent,
  variant = "secondary",
  onClick,
  className = "",
  disabled = false,
  type = "button",
  ariaLabel,
}: RefButtonProps) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {IconComponent && <IconComponent className="button-icon" />}
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Card (uses reference .card classes for consistent border / shadow)
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefCardProps {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  padded?: boolean;
}

export function RefCard({ children, title, description, actions, className = "", padded = true }: RefCardProps) {
  return (
    <section className={`card ${padded ? "ref-card-pad" : ""} ${className}`}>
      {(title || actions) && (
        <div className="ref-card-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="ref-card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Metric grid + cards
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefMetric {
  label: string;
  value: ReactNode;
  change?: ReactNode;
  helper?: ReactNode;
  icon?: Icon;
  tone?: "purple" | "blue" | "green" | "orange";
}

export function RefMetricGrid({ metrics }: { metrics: RefMetric[] }) {
  return (
    <div className="metrics-grid">
      {metrics.map((m) => (
        <article key={m.label} className="card metric-card">
          <div className="metric-top">
            {m.icon && (
              <div className={`metric-icon metric-icon-${m.tone ?? "purple"}`}><m.icon /></div>
            )}
            <button className="icon-button subtle" type="button" aria-label={`More options for ${m.label}`}><DotsVertical /></button>
          </div>
          <p className="metric-label">{m.label}</p>
          <div className="metric-value-row">
            <strong>{m.value}</strong>
            {m.change && <span className="positive">{m.change}</span>}
          </div>
          {m.helper && <p className="metric-helper">{m.helper}</p>}
        </article>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Table toolbar (search input + actions)
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefTableToolbarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  actions?: ReactNode;
}

export function RefTableToolbar({ searchPlaceholder, searchValue, onSearchChange, actions }: RefTableToolbarProps) {
  return (
    <div className="table-toolbar">
      <div className="table-search">
        {onSearchChange && (
          <input
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={searchPlaceholder ?? "Search"}
            placeholder={searchPlaceholder ?? "Search"}
          />
        )}
      </div>
      {actions && <div className="ref-table-actions">{actions}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Empty state
 * ──────────────────────────────────────────────────────────────────────────── */
export function RefEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-row">
      <strong>{title}</strong>
      {description && <div>{description}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading / error state view
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefStateViewProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  /** When true, render inside a table row spanning all columns. */
  colspan?: number;
  children?: ReactNode;
}

export function RefStateView({
  loading,
  error,
  empty,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  onRetry,
  children,
}: RefStateViewProps) {
  if (loading) {
    return (
      <div className="ref-state">
        <div className="ref-spinner" aria-hidden="true" />
        <div className="ref-state-title">Loading…</div>
        <div className="ref-state-body">Fetching the latest data from the control plane.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="ref-state">
        <div className="ref-state-error" role="alert">Couldn't reach the API: {error}</div>
        {onRetry && <RefButton variant="secondary" onClick={onRetry}>Retry</RefButton>}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="ref-state">
        <div className="ref-state-title">{emptyTitle}</div>
        {emptyDescription && <div className="ref-state-body">{emptyDescription}</div>}
        {onRetry && <RefButton variant="ghost" onClick={onRetry}>Refresh</RefButton>}
      </div>
    );
  }
  return <>{children}</>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Modal (uses the reference .modal classes)
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefModalProps {
  titleId: string;
  title: string;
  description?: string;
  icon?: Icon;
  children?: ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onClose: () => void;
  primaryDisabled?: boolean;
}

export function RefModal({
  titleId,
  title,
  description,
  icon: IconComponent,
  primaryLabel = "Confirm",
  secondaryLabel = "Cancel",
  onPrimary,
  onClose,
  primaryDisabled,
  children,
}: RefModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {IconComponent && <div className="modal-icon"><IconComponent /></div>}
        <button className="icon-button modal-close" type="button" aria-label="Close" onClick={onClose}><XClose /></button>
        <h2 id={titleId}>{title}</h2>
        {description && <p>{description}</p>}
        {children}
        <div className="modal-actions">
          <RefButton variant="secondary" onClick={onClose}>{secondaryLabel}</RefButton>
          {onPrimary && (
            <RefButton variant="primary" onClick={onPrimary} disabled={primaryDisabled}>{primaryLabel}</RefButton>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Toast (used for sync/approve feedback)
 * ──────────────────────────────────────────────────────────────────────────── */
export function RefToast({ children }: { children: ReactNode }) {
  return <div className="toast">{children}</div>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Side panel (slide-out review panel for Onboarding/Audit Logs)
 * ──────────────────────────────────────────────────────────────────────────── */
export interface RefSidePanelProps {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

export function RefSidePanel({ open, title, subtitle, onClose, children, actions }: RefSidePanelProps) {
  if (!open) return null;
  return (
    <div className="ref-panel-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="ref-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="ref-panel-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" type="button" aria-label="Close panel" onClick={onClose}>
            <XClose />
          </button>
        </header>
        <div className="ref-panel-body">{children}</div>
        {actions && <footer className="ref-panel-foot">{actions}</footer>}
      </aside>
    </div>
  );
}