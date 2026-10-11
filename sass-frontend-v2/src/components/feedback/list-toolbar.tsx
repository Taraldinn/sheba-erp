import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ListToolbarProps {
    search?: string;
    onSearchChange?: (next: string) => void;
    onSearchSubmit?: (next: string) => void;
    searchPlaceholder?: string;
    statusOptions?: Array<{ value: string; label: string }>;
    status?: string;
    onStatusChange?: (next: string | undefined) => void;
    extra?: ReactNode;
    onRefresh?: () => void;
    isRefreshing?: boolean;
}

/**
 * A consistent toolbar for list pages: search input (with submit), status
 * select, refresh button, and an `extra` slot for page-specific actions
 * (e.g. an "Export" button or a date range picker).
 */
export function ListToolbar({
    search,
    onSearchChange,
    onSearchSubmit,
    searchPlaceholder = 'Search…',
    statusOptions,
    status,
    onStatusChange,
    extra,
    onRefresh,
    isRefreshing,
}: ListToolbarProps) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <form
                className="flex flex-1 min-w-[220px] items-center gap-2"
                onSubmit={e => {
                    e.preventDefault();
                    onSearchSubmit?.(search ?? '');
                }}
            >
                <Input
                    placeholder={searchPlaceholder}
                    value={search ?? ''}
                    onChange={e => onSearchChange?.(e.target.value)}
                    className="max-w-sm flex-1"
                />
                <Button type="submit" variant="outline" size="sm">Search</Button>
                {search && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            onSearchChange?.('');
                            onSearchSubmit?.('');
                        }}
                    >
                        Clear
                    </Button>
                )}
            </form>
            {statusOptions && statusOptions.length > 0 && (
                <Select
                    value={status ?? '__all__'}
                    onValueChange={v => onStatusChange?.(v === '__all__' ? undefined : v)}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">All statuses</SelectItem>
                        {statusOptions.map(o => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            {onRefresh && (
                <Button variant="outline" size="sm" onClick={() => onRefresh()} disabled={isRefreshing}>
                    {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
            )}
            {extra}
        </div>
    );
}
