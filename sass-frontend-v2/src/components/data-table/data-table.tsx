import { useState, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from 'cn';

export interface DataTableColumn<T> {
    id?: string;
    header: ReactNode;
    cell?: (row: T, index: number) => ReactNode;
    sortable?: boolean;
    className?: string;
    headerClassName?: string;
    align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
    data: T[] | undefined;
    columns: DataTableColumn<T>[];
    isLoading?: boolean;
    error?: unknown;
    emptyState?: ReactNode;
    page?: number;
    pageSize?: number;
    totalCount?: number;
    onPageChange?: (next: number) => void;
    onRowClick?: (row: T, index: number) => void;
    toolbar?: ReactNode;
    testId?: string;
    rowKey: (row: T, index: number) => string;
}

export function DataTable<T>({
    data,
    columns,
    isLoading,
    error,
    emptyState,
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

    const total = typeof totalCount === 'number' ? totalCount : data?.length ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    const sorted = sort ? sortData(data ?? [], sort.column, sort.dir) : data ?? [];

    return (
        <div className="space-y-3" data-testid={testId}>
            {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((c, i) => (
                                <TableHead
                                    key={c.id ?? i}
                                    className={cn(c.headerClassName, c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}
                                >
                                    {c.sortable ? (
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 hover:underline"
                                            onClick={() => {
                                                const id = c.id ?? String(i);
                                                setSort(prev => {
                                                    if (prev?.column !== id) return { column: id, dir: 'asc' };
                                                    if (prev.dir === 'asc') return { column: id, dir: 'desc' };
                                                    return null;
                                                });
                                            }}
                                        >
                                            {c.header}
                                            {sort?.column === (c.id ?? String(i)) && (
                                                <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>
                                            )}
                                        </button>
                                    ) : (
                                        c.header
                                    )}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <TableRow key={i}>
                                    {columns.map((col, j) => (
                                        <TableCell key={j}>
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
                                    {emptyState ?? 'No records found.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            sorted.map((row, idx) => (
                                <TableRow
                                    key={rowKey(row, idx)}
                                    onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                                    className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                                >
                                    {columns.map((c, i) => (
                                        <TableCell
                                            key={c.id ?? i}
                                            className={cn(c.className, c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}
                                        >
                                            {c.cell ? c.cell(row, idx) : (c.id ? (row as Record<string, unknown>)[c.id] as ReactNode : null)}
                                        </TableCell>
                                    ))}
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