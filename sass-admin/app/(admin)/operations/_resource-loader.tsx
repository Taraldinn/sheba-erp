"use client";

/**
 * Shared "fetch a list resource and render it" component used by the
 * Catalogs and Operations hub pages. Centralizes the loading / error /
 * empty states so the hub pages stay declarative.
 */

import { useEffect, useState } from "react";
import { Alert, Spinner } from "@heroui/react";

import { api, ApiError } from "@/lib/api";

type Props<T> = {
  endpoint: string;
  render: (rows: T[]) => React.ReactNode;
  emptyHint?: string;
};

function extractRows<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (
    typeof data === "object" &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: T[] }).results;
  }
  return [];
}

export function ResourceLoader<T>({
  endpoint,
  render,
  emptyHint,
}: Props<T>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);

    api
      .get<unknown>(endpoint)
      .then((data) => {
        if (cancelled) return;
        setRows(extractRows<T>(data));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(`${err.status} ${err.message}`);
        else setError(err instanceof Error ? err.message : "Failed to load.");
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  if (error)
    return (
      <Alert status="danger" title="Couldn't load">
        {error}
      </Alert>
    );
  if (rows === null)
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-separator/80 bg-surface text-xs text-muted">
        <Spinner size="md" />
        <span>Fetching…</span>
      </div>
    );
  if (rows.length === 0)
    return (
      <Alert status="default" title="No records">
        {emptyHint ?? "There are no records to display yet."}
      </Alert>
    );

  return <>{render(rows)}</>;
}
