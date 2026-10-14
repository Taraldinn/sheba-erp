'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@/lib/query/native';
import { tjBoxesApi, branchesApi, type TJBox, type Branch, type FiberLine, type FiberCore, type TJBoxCategory, type FiberCoreStatus } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { Badge } from '@/components/ui/badge';
import {
    Plus,
    Pencil,
    Trash2,
    MapPin,
    ChevronUp,
    ChevronDown,
    Network,
    ExternalLink,
    Filter,
    Layers,
} from 'lucide-react';
import { toast } from 'sonner';

// Standard 12-fiber color code
const FIBER_COLORS = [
    { name: 'Blue', hex: '#2563eb' },
    { name: 'Orange', hex: '#f97316' },
    { name: 'Green', hex: '#16a34a' },
    { name: 'Brown', hex: '#854d0e' },
    { name: 'Slate / Grey', hex: '#64748b' },
    { name: 'White', hex: '#e2e8f0' },
    { name: 'Red', hex: '#ef4444' },
    { name: 'Black', hex: '#1e293b' },
    { name: 'Yellow', hex: '#eab308' },
    { name: 'Violet', hex: '#8b5cf6' },
    { name: 'Rose / Pink', hex: '#ec4899' },
    { name: 'Aqua / Cyan', hex: '#06b6d4' },
];

const CORE_CAPACITIES = ['2 C', '4 C', '6 C', '8 C', '12 C', '24 C', '48 C', '96 C'];

function parseCapacityNumber(cap: string): number {
    const num = parseInt(cap.replace(/\D/g, ''), 10);
    return isNaN(num) || num <= 0 ? 2 : num;
}

function generateDefaultCores(count: number, existing?: FiberCore[]): FiberCore[] {
    const cores: FiberCore[] = [];
    for (let i = 1; i <= count; i++) {
        const found = existing?.find(c => c.index === i);
        if (found) {
            cores.push(found);
        } else {
            const colorObj = FIBER_COLORS[(i - 1) % FIBER_COLORS.length];
            cores.push({
                index: i,
                status: 'Free',
                color: colorObj.name,
                note: '',
            });
        }
    }
    return cores;
}

function createDefaultFiberLine(): FiberLine {
    return {
        id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        capacity: '2 C',
        direction: 'In',
        brand: '',
        code: '',
        cores: generateDefaultCores(2),
        is_expanded: true,
    };
}

export default function TenantTJBoxesPage() {
    const list = useQuery({ queryKey: queryKeys.tjBoxes.list(), queryFn: () => tjBoxesApi.list() });
    const zonesQuery = useQuery({ queryKey: queryKeys.branches.list(), queryFn: () => branchesApi.list() });
    const zones = zonesQuery.data ?? [];

    const [zoneFilter, setZoneFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<TJBox | null>(null);
    const [pendingDelete, setPendingDelete] = useState<TJBox | null>(null);

    const create = useMutation({
        mutationFn: (data: Partial<TJBox>) => tjBoxesApi.create(data),
        onSuccess: () => {
            list.refetch();
            setCreating(false);
            toast.success('TJ Box created successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to create TJ Box');
        },
    });

    const update = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<TJBox> }) => tjBoxesApi.update(id, data),
        onSuccess: () => {
            list.refetch();
            setEditing(null);
            toast.success('TJ Box updated successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to update TJ Box');
        },
    });

    const remove = useMutation({
        mutationFn: (id: string) => tjBoxesApi.remove(id),
        onSuccess: () => {
            list.refetch();
            setPendingDelete(null);
            toast.success('TJ Box deleted successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete TJ Box');
        },
    });

    const filteredData = (list.data ?? []).filter(item => {
        if (zoneFilter !== 'all' && item.zone !== zoneFilter) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return (
                item.name.toLowerCase().includes(q) ||
                (item.zone_name && item.zone_name.toLowerCase().includes(q)) ||
                (item.notes && item.notes.toLowerCase().includes(q))
            );
        }
        return true;
    });

    const columns: DataTableColumn<TJBox>[] = [
        {
            id: 'name',
            header: 'Box Name / ID',
            sortable: true,
            cell: r => (
                <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.box_category || 'Master Box'}</span>
                </div>
            ),
        },
        {
            id: 'zone',
            header: 'Zone',
            cell: r => (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span>{r.zone_name || (zones.find(z => z.id === r.zone)?.name) || 'Unassigned'}</span>
                </div>
            ),
        },
        {
            id: 'category',
            header: 'Category',
            cell: r => {
                const cat = r.box_category || 'Master Box';
                const tone =
                    cat === 'Master Box'
                        ? 'border-primary/30 text-primary bg-primary/10'
                        : cat === 'Splitter Box'
                        ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
                        : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10';
                return (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                        {cat}
                    </span>
                );
            },
        },
        {
            id: 'fiber_lines',
            header: 'Fiber Lines & Cores',
            cell: r => {
                const lines = Array.isArray(r.fiber_code) ? r.fiber_code : [];
                let totalCores = 0;
                let connectedCores = 0;
                for (const l of lines) {
                    const c = Array.isArray(l.cores) ? l.cores : [];
                    totalCores += c.length || parseCapacityNumber(l.capacity || '2 C');
                    connectedCores += c.filter(core => core.status === 'Connected').length;
                }
                return (
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                            {lines.length} Line{lines.length !== 1 ? 's' : ''} · {totalCores} Cores
                        </Badge>
                        {connectedCores > 0 && (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                {connectedCores} connected
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            id: 'location',
            header: 'Location (GPS)',
            cell: r => {
                if (!r.lat_long && !r.latitude) return <span className="text-xs text-muted-foreground">—</span>;
                const coord = r.lat_long || `${r.latitude}, ${r.longitude}`;
                return (
                    <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(coord)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                        onClick={e => e.stopPropagation()}
                    >
                        <span>{coord}</span>
                        <ExternalLink className="size-3" />
                    </a>
                );
            },
        },
        {
            id: 'notes',
            header: 'Notes',
            cell: r => <span className="line-clamp-1 max-w-[200px] text-xs text-muted-foreground">{r.notes || '—'}</span>,
        },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: r => (
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => {
                            e.stopPropagation();
                            setEditing(r);
                        }}
                        title="Edit TJ Box"
                    >
                        <Pencil className="size-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={e => {
                            e.stopPropagation();
                            setPendingDelete(r);
                        }}
                        title="Delete TJ Box"
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="TJ Boxes / OLT Ports"
                description="Optical Terminal Joint Boxes (TJ Boxes), fiber optic line terminations, and core configurations."
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="size-4 mr-1" aria-hidden="true" />
                        Add TJ Box / OLT Port
                    </Button>
                }
            />

            {/* Filter Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 items-center gap-3">
                    <div className="w-full sm:max-w-xs">
                        <Input
                            placeholder="Search by box name, code, notes..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9"
                        />
                    </div>
                    <div className="w-48">
                        <Select value={zoneFilter} onValueChange={setZoneFilter}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="All Zones" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Zones</SelectItem>
                                {zones.map(z => (
                                    <SelectItem key={z.id} value={z.id}>
                                        {z.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <span className="text-xs text-muted-foreground">{filteredData.length} TJ boxes configured</span>
            </div>

            {list.error && <ErrorAlert title="Failed to load TJ boxes" error={list.error as Error} />}

            <DataTable<TJBox>
                data={filteredData}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No TJ Boxes found. Click 'Add TJ Box / OLT Port' to create your first distribution box."
                testId="tj-boxes-table"
                rowKey={r => r.id}
            />

            {(creating || editing) && (
                <TJBoxModal
                    open={Boolean(creating || editing)}
                    onOpenChange={o => {
                        if (!o) {
                            setCreating(false);
                            setEditing(null);
                        }
                    }}
                    zones={zones}
                    initial={editing}
                    pending={create.isPending || update.isPending}
                    onSubmit={async payload => {
                        if (editing) {
                            await update.mutateAsync({ id: editing.id, data: payload });
                        } else {
                            await create.mutateAsync(payload);
                        }
                    }}
                />
            )}

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={o => !o && setPendingDelete(null)}
                title="Delete TJ Box"
                description={
                    pendingDelete
                        ? `Are you sure you want to permanently delete TJ Box "${pendingDelete.name}"? Fiber core assignments and subscriber links will be removed.`
                        : ''
                }
                confirmLabel="Delete Box"
                destructive
                onConfirm={async () => {
                    if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
                }}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / Edit TJ Box / OLT Port Modal Dialog
// ─────────────────────────────────────────────────────────────────────────────

interface TJBoxModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    zones: Branch[];
    initial: TJBox | null;
    pending: boolean;
    onSubmit: (data: Partial<TJBox>) => Promise<unknown>;
}

function TJBoxModal({ open, onOpenChange, zones, initial, pending, onSubmit }: TJBoxModalProps) {
    const [name, setName] = useState(initial?.name || '');
    const [zone, setZone] = useState<string>(initial?.zone || '');
    const [boxCategory, setBoxCategory] = useState<TJBoxCategory>(initial?.box_category || 'Master Box');
    const [notes, setNotes] = useState(initial?.notes || '');
    const [latLong, setLatLong] = useState(initial?.lat_long || (initial?.latitude ? `${initial.latitude}, ${initial.longitude}` : ''));
    const [gettingGps, setGettingGps] = useState(false);

    // Fiber lines array
    const [fiberLines, setFiberLines] = useState<FiberLine[]>(() => {
        if (initial?.fiber_code && Array.isArray(initial.fiber_code) && initial.fiber_code.length > 0) {
            return initial.fiber_code.map(l => ({
                ...l,
                id: l.id || `line_${Math.random().toString(36).slice(2, 7)}`,
                capacity: l.capacity || `${l.cores?.length || 2} C`,
                direction: l.direction || 'In',
                brand: l.brand || '',
                code: l.code || '',
                cores: Array.isArray(l.cores) && l.cores.length > 0 ? l.cores : generateDefaultCores(parseCapacityNumber(l.capacity || '2 C')),
                is_expanded: l.is_expanded !== false,
            }));
        }
        return [createDefaultFiberLine()];
    });

    const handleAddLine = () => {
        setFiberLines([...fiberLines, createDefaultFiberLine()]);
    };

    const handleRemoveLine = (idx: number) => {
        setFiberLines(fiberLines.filter((_, i) => i !== idx));
    };

    const handleToggleExpand = (idx: number) => {
        setFiberLines(
            fiberLines.map((line, i) => (i === idx ? { ...line, is_expanded: !line.is_expanded } : line))
        );
    };

    const handleCapacityChange = (idx: number, newCap: string) => {
        setFiberLines(
            fiberLines.map((line, i) => {
                if (i !== idx) return line;
                const newCount = parseCapacityNumber(newCap);
                return {
                    ...line,
                    capacity: newCap,
                    cores: generateDefaultCores(newCount, line.cores),
                };
            })
        );
    };

    const handleLineFieldChange = (idx: number, field: 'direction' | 'brand' | 'code', val: string) => {
        setFiberLines(
            fiberLines.map((line, i) => (i === idx ? { ...line, [field]: val } : line))
        );
    };

    const handleCoreChange = (lineIdx: number, coreIdx: number, field: keyof FiberCore, val: any) => {
        setFiberLines(
            fiberLines.map((line, lIdx) => {
                if (lIdx !== lineIdx) return line;
                const updatedCores = line.cores.map((core, cIdx) => (cIdx === coreIdx ? { ...core, [field]: val } : core));
                return { ...line, cores: updatedCores };
            })
        );
    };

    const handleGetGps = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser.');
            return;
        }
        setGettingGps(true);
        navigator.geolocation.getCurrentPosition(
            pos => {
                setGettingGps(false);
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                setLatLong(`${lat}, ${lng}`);
                toast.success(`Acquired GPS location: ${lat}, ${lng}`);
            },
            err => {
                setGettingGps(false);
                toast.error(`Unable to retrieve GPS location: ${err.message}`);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error('Box Name / ID is required.');
            return;
        }

        const payload: Partial<TJBox> = {
            name: name.trim(),
            zone: zone || null,
            box_category: boxCategory,
            notes: notes.trim(),
            lat_long: latLong.trim(),
            fiber_code: fiberLines,
        };

        await onSubmit(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                        {initial ? 'Edit TJ Box / OLT Port' : 'Add TJ Box / OLT Port'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    {/* 1. Box Name / ID */}
                    <div className="space-y-1.5">
                        <Label htmlFor="box-name" className="text-xs font-medium text-foreground">
                            Box Name / ID
                        </Label>
                        <Input
                            id="box-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. BOX-A1"
                            className="h-10"
                            required
                        />
                    </div>

                    {/* 2. Select Zone */}
                    <div className="space-y-1.5">
                        <Label htmlFor="select-zone" className="text-xs font-medium text-foreground">
                            Select Zone
                        </Label>
                        <Select value={zone} onValueChange={setZone}>
                            <SelectTrigger id="select-zone" className="h-10">
                                <SelectValue placeholder="-- Select Zone --" />
                            </SelectTrigger>
                            <SelectContent>
                                {zones.map(z => (
                                    <SelectItem key={z.id} value={z.id}>
                                        {z.name} {z.code ? `(${z.code})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 3. Box Category */}
                    <div className="space-y-1.5">
                        <Label htmlFor="box-category" className="text-xs font-medium text-foreground">
                            Box Category
                        </Label>
                        <Select value={boxCategory} onValueChange={v => setBoxCategory(v as TJBoxCategory)}>
                            <SelectTrigger id="box-category" className="h-10">
                                <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Master Box">Master Box</SelectItem>
                                <SelectItem value="Splitter Box">Splitter Box</SelectItem>
                                <SelectItem value="Zone/point Box">Zone/point Box</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 4. Fiber Lines Section */}
                    <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold text-foreground">Fiber Lines</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddLine}
                                className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/50"
                            >
                                <Plus className="size-3.5 mr-1" />
                                Add Line
                            </Button>
                        </div>

                        {/* List of Line Cards */}
                        <div className="space-y-3">
                            {fiberLines.map((line, lineIdx) => (
                                <div
                                    key={line.id || lineIdx}
                                    className="rounded-lg border border-border bg-card p-3 shadow-xs transition-colors"
                                >
                                    {/* Line Header Controls */}
                                    <div className="flex items-center gap-2">
                                        {/* Capacity Select */}
                                        <div className="w-20 shrink-0">
                                            <Select
                                                value={line.capacity}
                                                onValueChange={v => handleCapacityChange(lineIdx, v)}
                                            >
                                                <SelectTrigger className="h-8 text-xs font-medium">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CORE_CAPACITIES.map(cap => (
                                                        <SelectItem key={cap} value={cap}>
                                                            {cap}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Direction Select */}
                                        <div className="w-20 shrink-0">
                                            <Select
                                                value={line.direction}
                                                onValueChange={v => handleLineFieldChange(lineIdx, 'direction', v)}
                                            >
                                                <SelectTrigger className="h-8 text-xs font-medium">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="In">In</SelectItem>
                                                    <SelectItem value="Out">Out</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Brand Input */}
                                        <div className="min-w-0 flex-1">
                                            <Input
                                                placeholder="Brand"
                                                value={line.brand || ''}
                                                onChange={e => handleLineFieldChange(lineIdx, 'brand', e.target.value)}
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        {/* Code Input */}
                                        <div className="min-w-0 flex-1">
                                            <Input
                                                placeholder="Code"
                                                value={line.code || ''}
                                                onChange={e => handleLineFieldChange(lineIdx, 'code', e.target.value)}
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        {/* Collapse / Expand Toggle */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                            onClick={() => handleToggleExpand(lineIdx)}
                                        >
                                            {line.is_expanded !== false ? (
                                                <ChevronUp className="size-4" />
                                            ) : (
                                                <ChevronDown className="size-4" />
                                            )}
                                        </Button>

                                        {/* Delete Line Trash Icon */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                                            onClick={() => handleRemoveLine(lineIdx)}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>

                                    {/* Cores Configuration Section */}
                                    {line.is_expanded !== false && (
                                        <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5">
                                            <p className="text-xs font-semibold text-foreground">Cores Configuration:</p>

                                            <div className="space-y-2">
                                                {line.cores.map((core, coreIdx) => {
                                                    const currentColor =
                                                        FIBER_COLORS.find(c => c.name === core.color) || FIBER_COLORS[coreIdx % FIBER_COLORS.length];
                                                    return (
                                                        <div
                                                            key={core.index || coreIdx}
                                                            className="flex items-center gap-2 rounded-md border border-border/80 bg-card p-1.5 text-xs shadow-xs transition-colors focus-within:border-primary/60"
                                                        >
                                                            {/* Index */}
                                                            <span className="w-5 shrink-0 text-center font-bold text-foreground">
                                                                {core.index}:
                                                            </span>

                                                            {/* Status Select */}
                                                            <div className="w-28 shrink-0">
                                                                <Select
                                                                    value={core.status}
                                                                    onValueChange={s =>
                                                                        handleCoreChange(lineIdx, coreIdx, 'status', s as FiberCoreStatus)
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-7 text-xs font-medium">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="Free">Free</SelectItem>
                                                                        <SelectItem value="Connected">Connected</SelectItem>
                                                                        <SelectItem value="Damaged">Damaged</SelectItem>
                                                                        <SelectItem value="Reserved">Reserved</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            {/* Fiber Color Select */}
                                                            <div className="w-24 shrink-0">
                                                                <Select
                                                                    value={core.color}
                                                                    onValueChange={col => handleCoreChange(lineIdx, coreIdx, 'color', col)}
                                                                >
                                                                    <SelectTrigger className="h-7 text-xs font-medium">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span
                                                                                className="size-3 rounded-full shrink-0 border border-black/20"
                                                                                style={{ backgroundColor: currentColor.hex }}
                                                                            />
                                                                            <span className="truncate">{currentColor.name}</span>
                                                                        </div>
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {FIBER_COLORS.map(fc => (
                                                                            <SelectItem key={fc.name} value={fc.name}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span
                                                                                        className="size-2.5 rounded-full shrink-0 border border-black/20"
                                                                                        style={{ backgroundColor: fc.hex }}
                                                                                    />
                                                                                    <span>{fc.name}</span>
                                                                                </div>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            {/* Note Input */}
                                                            <div className="min-w-0 flex-1">
                                                                <Input
                                                                    placeholder="Note"
                                                                    value={core.note || ''}
                                                                    onChange={e =>
                                                                        handleCoreChange(lineIdx, coreIdx, 'note', e.target.value)
                                                                    }
                                                                    className="h-7 text-xs"
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 5. Notes */}
                    <div className="space-y-1.5 pt-1">
                        <Label htmlFor="notes" className="text-xs font-medium text-foreground">
                            Notes (e.g. sub-zone names separated by comma)
                        </Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="e.g. SubZone-1, SubZone-2"
                            className="min-h-[70px] text-xs"
                        />
                    </div>

                    {/* 6. Location (Lat, Long) */}
                    <div className="space-y-1.5">
                        <Label htmlFor="lat-long" className="text-xs font-medium text-foreground">
                            Location (Lat, Long)
                        </Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="lat-long"
                                value={latLong}
                                onChange={e => setLatLong(e.target.value)}
                                placeholder="23.1234, 90.1234"
                                className="h-10 text-xs font-mono"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleGetGps}
                                disabled={gettingGps}
                                className="h-10 shrink-0 gap-1.5 px-3 text-xs"
                            >
                                <MapPin className="size-3.5 text-primary" />
                                {gettingGps ? 'Getting…' : 'Get'}
                            </Button>
                        </div>
                    </div>

                    {/* 7. Save Box Button (Primary Accent) */}
                    <div className="pt-3">
                        <Button
                            type="submit"
                            disabled={pending}
                            className="w-full font-medium h-11 text-sm shadow-xs"
                        >
                            {pending ? 'Saving Box…' : 'Save Box'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
