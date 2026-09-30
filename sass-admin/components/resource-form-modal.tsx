"use client";

/**
 * Declarative CRUD modal — used by `AdminResourcePage` for create / edit
 * and rendered manually for any custom one-off (e.g. settings page).
 *
 * Renders inputs based on the field config, captures submit, and calls
 * `onSubmit(payload)` with a JSON body the parent forwards to the API.
 * HeroUI v3 has no `Modal` primitive, so this is a centered dialog
 * built from a backdrop + card. Matches the visual style of the user
 * menu in `admin-shell.tsx`.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Alert, Button, Checkbox, Spinner } from "@heroui/react";

import {
  buildPayload,
  type ResourceField,
} from "@/lib/resource-config";
import { cn } from "@/lib/utils";

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  title: string;
  description?: string;
  fields: ResourceField[];
  initialValues?: Record<string, unknown>;
  /** Show an extra read-only row at the top (e.g. id, created_at). */
  metaReadout?: ReactNode;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
};

function initialState(
  fields: ResourceField[],
  mode: Mode,
  initial: Record<string, unknown> | undefined,
): Record<string, string> {
  const state: Record<string, string> = {};
  const source = mode === "edit" && initial ? initial : {};

  for (const field of fields) {
    if (mode === "create" && field.hideOnCreate) continue;
    if (mode === "edit" && field.hideOnEdit) continue;

    const v = (source as Record<string, unknown>)[field.name];
    if (v === undefined || v === null) {
      state[field.name] =
        field.defaultValue !== undefined && field.defaultValue !== null
          ? String(field.defaultValue)
          : "";
    } else if (typeof v === "boolean") {
      state[field.name] = v ? "true" : "false";
    } else {
      state[field.name] = String(v);
    }
  }
  return state;
}

export function ResourceFormModal({
  open,
  mode,
  title,
  description,
  fields,
  initialValues,
  metaReadout,
  submitLabel,
  busy = false,
  error = null,
  onCancel,
  onSubmit,
}: Props) {
  const [state, setState] = useState<Record<string, string>>(() =>
    initialState(fields, mode, initialValues),
  );

  // Reset the form whenever the modal opens or the source data changes.
  useEffect(() => {
    if (open) {
      setState(initialState(fields, mode, initialValues));
    }
    // We intentionally depend on `open` and the field set; initialValues is
    // read at reset time so updating it mid-flight shouldn't surprise the
    // user mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, fields]);

  const visibleFields = useMemo(
    () =>
      fields.filter((f) => {
        if (mode === "create" && f.hideOnCreate) return false;
        if (mode === "edit" && f.hideOnEdit) return false;

        return true;
      }),
    [fields, mode],
  );

  // Close on Escape.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmit(buildPayload(state, { fields }, mode));
  }

  function setField(name: string, value: string) {
    setState((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
    >
      {/* Backdrop */}
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
        type="button"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />

      {/* Panel */}
      <form
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-separator bg-surface shadow-2xl animate-in zoom-in-95 duration-150"
        onSubmit={handleSubmit}
      >
        <header className="border-b border-separator/70 px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            {submitLabel ?? (mode === "create" ? title : `Edit ${title}`)}
          </h2>
          {description && (
            <p className="mt-0.5 text-[11px] text-muted">{description}</p>
          )}
        </header>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          {metaReadout}

          {error ? (
            <Alert status="danger" title="Couldn't save">
              {error}
            </Alert>
          ) : null}

          {visibleFields.length === 0 ? (
            <p className="text-xs text-muted">
              This record has no editable fields. Close to continue.
            </p>
          ) : null}

          {visibleFields.map((field) => (
            <FieldRow
              field={field}
              key={field.name}
              value={state[field.name] ?? ""}
              onChange={(v) => setField(field.name, v)}
            />
          ))}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-separator/70 px-5 py-3">
          <Button
            className="rounded-full text-xs font-semibold"
            isDisabled={busy}
            type="button"
            variant="tertiary"
            onPress={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="rounded-full text-xs font-semibold"
            isDisabled={busy || visibleFields.length === 0}
            type="submit"
            variant="primary"
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner size="sm" />
                Saving…
              </span>
            ) : (
              (submitLabel ?? (mode === "create" ? "Create" : "Save changes"))
            )}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ResourceField;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `field-${field.name}`;
  const baseInput =
    "w-full rounded-lg border border-separator/80 bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-foreground focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted"
        htmlFor={id}
      >
        <span>{field.label}</span>
        {field.required ? (
          <span className="text-danger" aria-label="required">
            *
          </span>
        ) : null}
      </label>

      {field.type === "textarea" || field.type === "multiline-readonly" ? (
        <textarea
          className={cn(baseInput, "min-h-[88px] resize-y")}
          disabled={field.readOnly}
          id={id}
          placeholder={field.placeholder}
          readOnly={field.type === "multiline-readonly"}
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "checkbox" ? (
        <Checkbox
          isDisabled={field.readOnly}
          isSelected={value === "true" || value === "on"}
          name={field.name}
          onChange={(checked) => onChange(checked ? "true" : "false")}
        >
          <span className="text-xs text-foreground">
            {field.placeholder ?? "Enabled"}
          </span>
        </Checkbox>
      ) : field.type === "select" ? (
        <select
          className={cn(baseInput, "appearance-none pr-8")}
          disabled={field.readOnly}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={baseInput}
          disabled={field.readOnly}
          id={id}
          inputMode={
            field.type === "number" ? "decimal" : field.type === "email" ? "email" : "text"
          }
          placeholder={field.placeholder}
          type={
            field.type === "password"
              ? "password"
              : field.type === "email"
                ? "email"
                : field.type === "url"
                  ? "url"
                  : field.type === "number"
                    ? "number"
                    : "text"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.helpText ? (
        <p className="text-[11px] text-muted">{field.helpText}</p>
      ) : null}
    </div>
  );
}
