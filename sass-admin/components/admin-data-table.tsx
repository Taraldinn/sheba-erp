"use client";

import { useState, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SearchIcon } from "@/components/nav-icons";

export type AdminColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type Props<T> = {
  columns: AdminColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string | number;
  empty?: ReactNode;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFields?: (keyof T | string)[];
};

export function AdminDataTable<T>({
  columns,
  rows,
  getRowId,
  empty,
  className,
  searchable = true,
  searchPlaceholder = "Search records...",
  searchFields,
}: Props<T>) {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || !searchable) return rows;

    return rows.filter((row) => {
      if (searchFields && searchFields.length > 0) {
        return searchFields.some((field) => {
          const val = (row as Record<string, unknown>)[field as string];
          return val !== undefined && val !== null && String(val).toLowerCase().includes(q);
        });
      }
      // Default: inspect all string or number values on row object
      return Object.values(row as Record<string, unknown>).some((val) => {
        if (typeof val === "string" || typeof val === "number") {
          return String(val).toLowerCase().includes(q);
        }
        return false;
      });
    });
  }, [rows, query, searchable, searchFields]);

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-separator/80 bg-surface shadow-xs", className)}>
      {searchable && rows.length > 0 && (
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-separator/70 bg-surface">
          <div className="relative flex items-center">
            <span className="absolute left-3 text-muted">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-56 sm:w-72 rounded-full border border-separator/80 bg-surface-secondary/40 pl-8 pr-3 text-xs placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
            />
          </div>
          <span className="text-xs text-muted">
            Showing <strong className="text-foreground">{filteredRows.length}</strong> of {rows.length} entries
          </span>
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className="p-12 text-center text-xs text-muted">
          {empty ?? (query ? `No records matching "${query}".` : "No records to display.")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-separator/60 bg-surface-secondary/40 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cn("px-5 py-3.5 font-semibold", c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-separator/40">
              {filteredRows.map((row) => (
                <tr key={getRowId(row)} className="hover:bg-default/30 transition-colors">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-5 py-3.5 align-middle text-foreground", c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
