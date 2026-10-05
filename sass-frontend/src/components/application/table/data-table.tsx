import React from 'react';
import { SearchLg, ArrowUp, ArrowDown, RefreshCw01 } from '@untitledui/icons';
import { Table, TableCard } from './table';
import { Input } from '@/components/base/input/input';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { LoadingState } from '../state-views/state-views';

export interface ColumnDef<T> {
    key: string;
    label: string;
    sortable?: boolean;
    className?: string;
    render?: (item: T, index: number) => React.ReactNode;
}

export type Column<T> = ColumnDef<T>;

export interface DataTableProps<T> {
    title?: string;
    description?: string;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    columns: ColumnDef<T>[];
    data: T[];
    totalCount: number;
    page: number;
    pageSize: number;
    isLoading?: boolean;
    error?: string | null;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    searchQuery?: string;
    searchPlaceholder?: string;
    onPageChange: (newPage: number) => void;
    onPageSizeChange?: (newPageSize: number) => void;
    onSortChange?: (field: string, direction: 'asc' | 'desc') => void;
    onSearchChange?: (query: string) => void;
    onRefresh?: () => void;
    onRetry?: () => void;
    emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
    title,
    description,
    badge,
    actions,
    columns,
    data,
    totalCount,
    page,
    pageSize,
    isLoading = false,
    error = null,
    sortField,
    sortDirection = 'asc',
    searchQuery,
    searchPlaceholder = 'Search records...',
    onPageChange,
    onPageSizeChange,
    onSortChange,
    onSearchChange,
    onRefresh,
    emptyMessage = 'No records found',
}: DataTableProps<T>) {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const endRecord = Math.min(page * pageSize, totalCount);

    const handleSort = (key: string, sortable?: boolean) => {
        if (!sortable || !onSortChange) return;
        if (sortField === key) {
            onSortChange(key, sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            onSortChange(key, 'asc');
        }
    };

    return (
        <TableCard.Root className="w-full">
            {(title || onSearchChange || actions) && (
                <div className="flex flex-col gap-4 border-b border-secondary bg-primary p-4 md:flex-row md:items-center md:justify-between md:px-6">
                    <div>
                        {title && (
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-primary">{title}</h3>
                                {badge && <Badge size="sm" color="brand">{badge}</Badge>}
                            </div>
                        )}
                        {description && <p className="text-sm text-tertiary mt-0.5">{description}</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {onSearchChange && (
                            <div className="w-64">
                                <Input
                                    size="sm"
                                    placeholder={searchPlaceholder}
                                    icon={SearchLg}
                                    value={searchQuery || ''}
                                    onChange={(val) => onSearchChange(val)}
                                />
                            </div>
                        )}
                        {onRefresh && (
                            <Button
                                size="sm"
                                color="secondary"
                                iconLeading={RefreshCw01}
                                onClick={onRefresh}
                                isLoading={isLoading}
                                aria-label="Refresh data"
                            />
                        )}
                        {actions}
                    </div>
                </div>
            )}

            <div className="overflow-x-auto relative min-h-[160px]">
                {isLoading && (
                    <div className="absolute inset-0 bg-primary/70 z-10 flex items-center justify-center backdrop-blur-xs">
                        <LoadingState message="Loading data from server..." />
                    </div>
                )}

                {error ? (
                    <div className="text-center py-12 px-4 text-error-primary">
                        <p className="font-medium text-sm">Error loading data</p>
                        <p className="text-xs text-tertiary mt-1">{error}</p>
                        {onRefresh && (
                            <Button size="sm" color="secondary" onClick={onRefresh} className="mt-3">
                                Retry
                            </Button>
                        )}
                    </div>
                ) : data.length === 0 && !isLoading ? (
                    <div className="text-center py-12 px-4 text-tertiary">
                        <p className="text-sm font-medium">{emptyMessage}</p>
                        {searchQuery && (
                            <p className="text-xs text-quaternary mt-1">
                                No records matched &quot;{searchQuery}&quot;
                            </p>
                        )}
                    </div>
                ) : (
                    <Table size="md" className="w-full text-left">
                        <Table.Header>
                            {columns.map((col, idx) => (
                                <Table.Head
                                    key={col.key}
                                    isRowHeader={idx === 0}
                                    className={col.sortable ? 'cursor-pointer select-none hover:text-primary' : ''}
                                    onClick={() => handleSort(col.key, col.sortable)}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span>{col.label}</span>
                                        {col.sortable && sortField === col.key && (
                                            sortDirection === 'asc' ? (
                                                <ArrowUp className="size-3.5 text-brand-primary" />
                                            ) : (
                                                <ArrowDown className="size-3.5 text-brand-primary" />
                                            )
                                        )}
                                    </div>
                                </Table.Head>
                            ))}
                        </Table.Header>

                        <Table.Body>
                            {data.map((item, index) => (
                                <Table.Row key={item.id || index}>
                                    {columns.map((col) => (
                                        <Table.Cell key={col.key} className={col.className}>
                                            {col.render ? col.render(item, index) : (item[col.key] ?? '—')}
                                        </Table.Cell>
                                    ))}
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </div>

            {/* Server Pagination Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-secondary bg-primary px-4 py-3 md:px-6">
                <div className="text-sm text-tertiary">
                    Showing <span className="font-medium text-primary">{startRecord}</span> to{' '}
                    <span className="font-medium text-primary">{endRecord}</span> of{' '}
                    <span className="font-medium text-primary">{totalCount}</span> results
                </div>

                <div className="flex items-center gap-2">
                    {onPageSizeChange && (
                        <div className="flex items-center gap-1.5 text-xs text-tertiary mr-2">
                            <span>Per page:</span>
                            <select
                                className="bg-secondary border border-secondary rounded px-1.5 py-1 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                                value={pageSize}
                                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    )}

                    <Button
                        size="sm"
                        color="secondary"
                        isDisabled={page <= 1 || isLoading}
                        onClick={() => onPageChange(page - 1)}
                    >
                        Previous
                    </Button>
                    <div className="text-xs text-tertiary px-2">
                        Page {page} of {totalPages}
                    </div>
                    <Button
                        size="sm"
                        color="secondary"
                        isDisabled={page >= totalPages || isLoading}
                        onClick={() => onPageChange(page + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </TableCard.Root>
    );
}
