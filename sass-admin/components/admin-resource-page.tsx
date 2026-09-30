"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Spinner, Chip } from "@heroui/react";

import { api, ApiError } from "@/lib/api";
import {
  AdminDataTable,
  type AdminColumn,
} from "@/components/admin-data-table";
import { ResourceFormModal } from "@/components/resource-form-modal";
import type { ResourceFormConfig } from "@/lib/resource-config";

type Props<T> = {
  title: string;
  description?: string;
  endpoint: string;
  columns: AdminColumn<T>[];
  getRowId: (row: T) => string | number;
  empty?: React.ReactNode;
  query?: Record<string, string | number | boolean | undefined | null>;
  searchPlaceholder?: string;
  extraHeaderActions?: React.ReactNode;
  /**
   * Optional declarative CRUD config. When provided, the page renders
   * Edit/Delete row actions + a "+ New" button, and POST/PATCH/DELETE
   * the resource endpoint. Omit for read-only resources.
   */
  form?: ResourceFormConfig;
};

function isPaginated(payload: unknown): payload is { results: unknown[] } {
  return (
    !!payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { results?: unknown }).results)
  );
}

type EditorState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; row: Record<string, unknown> };

export function AdminResourcePage<T>({
  title,
  description,
  endpoint,
  columns,
  getRowId,
  empty,
  query,
  searchPlaceholder,
  extraHeaderActions,
  form,
}: Props<T>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<EditorState>({ kind: "closed" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setError(null);
    setRows(null);
    api
      .get<unknown>(endpoint, query)
      .then((data) => {
        if (cancelled) return;
        const list = isPaginated(data)
          ? (data.results as T[])
          : Array.isArray(data)
            ? (data as T[])
            : [];

        setRows(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(`${err.status} ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, reloadKey, query]);

  const reload = () => setReloadKey((k) => k + 1);

  async function handleSubmit(payload: Record<string, unknown>) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editor.kind === "create") {
        await api.post(endpoint, payload);
      } else if (editor.kind === "edit") {
        const id = getRowId(editor.row as T);

        await api.patch(`${endpoint}${id}/`, payload);
      }
      setEditor({ kind: "closed" });
      reload();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSubmitError(`${err.status} ${err.message}`);
      } else {
        setSubmitError(err instanceof Error ? err.message : "Save failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(row: T) {
    const id = getRowId(row);

    if (form?.confirmDelete) {
      const msg = form.confirmDelete(row as Record<string, unknown>);
      if (msg) {
        const ok = typeof window !== "undefined" ? window.confirm(msg) : true;
        if (!ok) return;
      }
    } else if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Delete this ${title.toLowerCase().slice(0, -1)}? This can't be undone.`,
      );
      if (!ok) return;
    }

    try {
      await api.delete(`${endpoint}${id}/`);
      reload();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(`${err.status} ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Delete failed.");
      }
    }
  }

  const columnsWithActions: AdminColumn<T>[] = form
    ? [
        ...columns,
        {
          key: "__actions",
          header: "",
          className: "w-24 text-right",
          render: (row: T) => (
            <div className="flex items-center justify-end gap-1">
              {form.canEdit !== false && (
                <Button
                  className="rounded-full px-2 py-1 text-[10px]"
                  size="sm"
                  variant="tertiary"
                  onPress={() =>
                    setEditor({
                      kind: "edit",
                      row: row as Record<string, unknown>,
                    })
                  }
                >
                  Edit
                </Button>
              )}
              {form.canDelete !== false && (
                <Button
                  className="rounded-full px-2 py-1 text-[10px] text-danger hover:bg-danger/10"
                  size="sm"
                  variant="tertiary"
                  onPress={() => handleDelete(row)}
                >
                  Delete
                </Button>
              )}
            </div>
          ),
        },
      ]
    : columns;

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {rows !== null && (
              <Chip
                className="text-xs font-semibold"
                color="accent"
                size="sm"
                variant="soft"
              >
                {rows.length} {rows.length === 1 ? "Record" : "Records"}
              </Chip>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted mt-0.5">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {extraHeaderActions}
          {form?.canCreate !== false && form && (
            <Button
              className="rounded-full text-xs font-semibold"
              size="sm"
              variant="primary"
              onPress={() => setEditor({ kind: "create" })}
            >
              {form.newLabel ?? `+ New ${title.replace(/s$/, "")}`}
            </Button>
          )}
          <Button
            className="rounded-full text-xs font-semibold"
            isDisabled={rows === null}
            size="sm"
            variant="tertiary"
            onPress={reload}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Alert status="danger" title="Couldn't load data">
          {error}
        </Alert>
      ) : null}

      {rows === null && !error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-separator/80 bg-surface text-xs text-muted">
          <Spinner size="md" />
          <span>Fetching control plane records…</span>
        </div>
      ) : (
        <AdminDataTable
          columns={columnsWithActions}
          empty={empty}
          getRowId={getRowId}
          rows={rows ?? []}
          searchPlaceholder={searchPlaceholder}
        />
      )}

      {form && editor.kind !== "closed" && (
        <ResourceFormModal
          description={description}
          error={submitError}
          fields={form.fields}
          initialValues={
            editor.kind === "edit" ? editor.row : undefined
          }
          mode={editor.kind}
          open
          title={title.replace(/s$/, "")}
          busy={submitting}
          onCancel={() => {
            if (!submitting) {
              setEditor({ kind: "closed" });
              setSubmitError(null);
            }
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
