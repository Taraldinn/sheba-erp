"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Spinner, Chip } from "@heroui/react";

import { api, ApiError } from "@/lib/api";
import { AdminCard } from "@/components/admin-card";
import { AdminDataTable, type AdminColumn } from "@/components/admin-data-table";

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
};

function isPaginated(payload: unknown): payload is { results: unknown[] } {
  return !!payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results);
}

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
}: Props<T>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
              <Chip color="accent" size="sm" variant="soft" className="text-xs font-semibold">
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
          <Button
            isDisabled={rows === null}
            variant="tertiary"
            size="sm"
            className="rounded-full text-xs font-semibold"
            onPress={() => setReloadKey((k) => k + 1)}
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
          columns={columns}
          rows={rows ?? []}
          getRowId={getRowId}
          empty={empty}
          searchPlaceholder={searchPlaceholder}
        />
      )}
    </div>
  );
}
