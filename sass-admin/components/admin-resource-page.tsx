"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@heroui/react";

import { api, ApiError } from "@/lib/api";
import { AdminCard } from "@/components/admin-card";
import { AdminDataTable, type AdminColumn } from "@/components/admin-data-table";
import { AdminPageHeader } from "@/components/admin-page-header";

type Props<T> = {
  title: string;
  description?: string;
  endpoint: string;
  columns: AdminColumn<T>[];
  getRowId: (row: T) => string | number;
  empty?: React.ReactNode;
  query?: Record<string, string | number | boolean | undefined | null>;
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
          : (data as T[]);
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
    <>
      <AdminPageHeader
        title={title}
        description={description}
        actions={
          <Button
            isDisabled={rows === null}
            variant="tertiary"
            onPress={() => setReloadKey((k) => k + 1)}
          >
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert status="danger" title="Couldn't load data" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {rows === null && !error ? (
        <AdminCard>
          <div className="flex items-center gap-3 p-6 text-sm text-muted">
            <Spinner size="sm" /> Loading…
          </div>
        </AdminCard>
      ) : (
        <AdminDataTable
          columns={columns}
          rows={rows ?? []}
          getRowId={getRowId}
          empty={empty}
        />
      )}
    </>
  );
}
