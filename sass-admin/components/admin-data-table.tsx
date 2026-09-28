import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

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
};

export function AdminDataTable<T>({
  columns,
  rows,
  getRowId,
  empty,
  className,
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-separator bg-surface p-8 text-center text-sm text-muted", className)}>
        {empty ?? "No records to display."}
      </div>
    );
  }
  return (
    <div className={cn("overflow-hidden rounded-lg border border-separator bg-surface", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-3 font-semibold", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-separator">
            {rows.map((row) => (
              <tr key={getRowId(row)} className="hover:bg-default/40">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
