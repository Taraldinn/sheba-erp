import { useState, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from 'cn';

export interface DataTableColumn<T> {
    id?: string;
    key?: string;
    header?: ReactNode;
    title?: ReactNode;
    cell?: (row: T, index: number) => ReactNode;
    render?: (row: T, index: number) => ReactNode;
    sortable?: boolean;
    className?: string;
    headerClassName?: string;
    align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
    data: T[] | undefined;
    columns: DataTableColumn<T>[];
    isLoading?: boolean;
    loading?: boolean;
    error?: unknown;
    emptyState?: ReactNode;
    emptyTitle?: string;
    emptyDescription?: string;
    page?: number;
    pageSize?: number;
    totalCount?: number;
    onPageChange?: (next: number) => void;
    onRowClick?: (row: T, index: number) => void;
    toolbar?: ReactNode;
    testId?: string;
    rowKey?: (row: T, index: number) => string;
}

export function DataTable<T>({
    data,
    columns,
    isLoading,
    loading,
    error,
    emptyState,
    emptyTitle,
    emptyDescription,
    page = 1,
    pageSize = 20,
    totalCount,
    onPageChange,
    onRowClick,
    toolbar,
    testId,
    rowKey,
}: DataTableProps<T>) {
    const [sort, setSort] = useState<{ column: string; dir: 'asc' | 'desc' } | null>(null);
    const effectiveLoading = isLoading ?? loading;

    const getRowKey = (row: T, idx: number): string => {
        if (typeof rowKey === 'function') {
            try {
                return String(rowKey(row, idx));
            } catch {
                // fall through
            }
        }
        if (row && typeof row === 'object') {
            const anyRow = row as Record<string, unknown>;
            if (anyRow.id !== undefined && anyRow.id !== null) return String(anyRow.id);
            if (anyRow.key !== undefined && anyRow.key !== null) return String(anyRow.key);
            if (anyRow._id !== undefined && anyRow._id !== null) return String(anyRow._id);
            if (anyRow.uuid !== undefined && anyRow.uuid !== null) return String(anyRow.uuid);
        }
        return String(idx);
    };

    const total = typeof totalCount === 'number' ? totalCount : data?.length ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    const sorted = sort ? sortData(data ?? [], sort.column, sort.dir) : data ?? [];

    const effectiveEmptyState =
        emptyState ??
        (emptyTitle ? (
            <div className="space-y-1">
                <div className="font-medium text-foreground">{emptyTitle}</div>
                {emptyDescription && <div className="text-xs text-muted-foreground">{emptyDescription}</div>}
            </div>
        ) : (
            'No records found.'
        ));

    return (
        <div className="space-y-3" data-testid={testId}>
            {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((c, i) => {
                                const headerLabel = c.header ?? c.title;
                                const colId = c.id ?? c.key ?? String(i);
                                return (
                                    <TableHead
                                        key={colId}
                                        className={cn(c.headerClassName, c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}
                                    >
                                        {c.sortable ? (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 hover:underline"
                                                onClick={() => {
                                                    setSort(prev => {
                                                        if (prev?.column !== colId) return { column: colId, dir: 'asc' };
                                                        if (prev.dir === 'asc') return { column: colId, dir: 'desc' };
                                                        return null;
                                                    });
                                                }}
                                            >
                                                {headerLabel}
                                                {sort?.column === colId && (
                                                    <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </button>
                                        ) : (
                                            headerLabel
                                        )}
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {effectiveLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <TableRow key={i}>
                                    {columns.map((col, j) => (
                                        <TableCell key={col.id ?? col.key ?? j}>
                                            <Skeleton className="h-4 w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : error ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-destructive">
                                    Failed to load data: {(error as Error).message ?? 'unknown error'}
                                </TableCell>
                            </TableRow>
                        ) : sorted.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                                    {effectiveEmptyState}
                                </TableCell>
                            </TableRow>
                        ) : (
                            sorted.map((row, idx) => (
                                <TableRow
                                    key={getRowKey(row, idx)}
                                    onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                                    className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                                >
                                    {columns.map((c, i) => {
                                        const cellFn = c.cell ?? c.render;
                                        const colId = c.id ?? c.key;
                                        return (
                                            <TableCell
                                                key={colId ?? i}
                                                className={cn(c.className, c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}
                                            >
                                                {cellFn
                                                    ? cellFn(row, idx)
                                                    : (colId ? (row as Record<string, unknown>)[colId] as ReactNode : null)}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                    Page {page} of {pageCount} · {total} {total === 1 ? 'record' : 'records'}
                </span>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => onPageChange?.(page - 1)} disabled={page <= 1}>
                        Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onPageChange?.(page + 1)} disabled={page >= pageCount}>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}

function sortData<T>(data: T[], columnId: string, dir: 'asc' | 'desc'): T[] {
    const copy = [...data];
    copy.sort((a, b) => {
        const av = (a as Record<string, unknown>)[columnId];
        const bv = (b as Record<string, unknown>)[columnId];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
        return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
}