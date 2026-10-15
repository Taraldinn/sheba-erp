'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/query/native';
import {
    Activity,
    ArrowDownToLine,
    ArrowLeft,
    ArrowUpFromLine,
    Calendar,
    Download,
    HardDrive,
    RefreshCw,
    Search,
    Server,
    Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { liveUsageApi, routerApi, type Router } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export default function BandwidthReportsPage() {
    const [reportType, setReportType] = React.useState<'history' | 'top_users' | 'router_wise'>('history');
    const [selectedRouter, setSelectedRouter] = React.useState<string>('all');
    const [searchQuery, setSearchQuery] = React.useState<string>('');

    // Fetch Routers
    const routersQuery = useQuery({
        queryKey: queryKeys.routers.list(),
        queryFn: () => routerApi.list(),
    });
    const routersList: Router[] = (routersQuery.data as any) || [];

    // Fetch Report Data
    const reportQuery = useQuery({
        queryKey: ['bandwidth', 'reports', reportType, selectedRouter],
        queryFn: async () => {
            const rId = selectedRouter === 'all' ? undefined : selectedRouter;
            return liveUsageApi.getReports({
                type: reportType,
                router_id: rId,
            });
        },
    });

    const reportData = reportQuery.data || {};
    const summary = reportData.summary || {};
    const rawRecords = Array.isArray(reportData.records) ? reportData.records : [];

    // Filter by search query
    const filteredRecords = React.useMemo(() => {
        if (!searchQuery.trim()) return rawRecords;
        const q = searchQuery.toLowerCase().trim();
        return rawRecords.filter((r: any) => {
            const u = (r.username || '').toLowerCase();
            const n = (r.client_name || '').toLowerCase();
            const rtr = (r.router_name || '').toLowerCase();
            return u.includes(q) || n.includes(q) || rtr.includes(q);
        });
    }, [rawRecords, searchQuery]);

    // CSV Export
    const handleExportCSV = () => {
        if (!filteredRecords.length) {
            toast.error('No report records to export.');
            return;
        }

        let headers: string[] = [];
        let rows: string[][] = [];

        if (reportType === 'top_users') {
            headers = ['Rank', 'PPPoE Username', 'Client Name', 'Package', 'Download', 'Upload', 'Total'];
            rows = filteredRecords.map((r: any) => [
                r.rank,
                r.username,
                `"${(r.client_name || '').replace(/"/g, '""')}"`,
                `"${r.package || ''}"`,
                r.download,
                r.upload,
                r.total,
            ]);
        } else {
            headers = ['Date', 'PPPoE Username', 'Client Name', 'Router', 'Download', 'Upload', 'Total', 'Uptime'];
            rows = filteredRecords.map((r: any) => [
                r.date,
                r.username,
                `"${(r.client_name || '').replace(/"/g, '""')}"`,
                `"${r.router_name || ''}"`,
                r.download,
                r.upload,
                r.total,
                r.uptime,
            ]);
        }

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `bandwidth-report-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filteredRecords.length} records to CSV.`);
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Top Navigation & Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link
                            href="/tenant/bandwidth"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="size-3.5" />
                            Back to Live Usage
                        </Link>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <HardDrive className="size-5" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Bandwidth & Traffic Usage Reports</h1>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Historical roll-up data, daily subscriber volume logs, and top consuming accounts
                    </p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Router Select */}
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-2.5 py-1.5 shadow-2xs">
                        <Server className="size-3.5 text-muted-foreground" />
                        <select
                            value={selectedRouter}
                            onChange={e => setSelectedRouter(e.target.value)}
                            className="bg-transparent text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
                        >
                            <option value="all">All Routers</option>
                            {routersList.map(r => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Report Type Tabs */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-card/80 p-1 shadow-2xs">
                        {[
                            { key: 'history', label: 'Daily History' },
                            { key: 'top_users', label: 'Top Consumers' },
                            { key: 'router_wise', label: 'Router Wise' },
                        ].map(t => (
                            <button
                                key={t.key}
                                onClick={() => setReportType(t.key as any)}
                                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                                    reportType === t.key
                                        ? 'bg-primary text-primary-foreground shadow-2xs'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs font-medium">
                        <Download className="size-3.5" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            {reportType === 'history' && summary.total_bandwidth && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card className="border-border/80 bg-card/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Activity className="size-4 text-primary" />
                            Total Bandwidth Consumed
                        </div>
                        <div className="text-2xl font-bold font-mono text-foreground mt-2">{summary.total_bandwidth}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">Aggregated RX + TX in period</div>
                    </Card>

                    <Card className="border-border/80 bg-card/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <ArrowDownToLine className="size-4" />
                            Total Download (RX)
                        </div>
                        <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                            {summary.total_download}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">Downstream subscriber traffic</div>
                    </Card>

                    <Card className="border-border/80 bg-card/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-sky-600 dark:text-sky-400">
                            <ArrowUpFromLine className="size-4" />
                            Total Upload (TX)
                        </div>
                        <div className="text-2xl font-bold font-mono text-sky-600 dark:text-sky-400 mt-2">
                            {summary.total_upload}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">Upstream subscriber traffic</div>
                    </Card>
                </div>
            )}

            {/* Table Card */}
            <Card className="border-border/80 bg-card/70 shadow-xs">
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="text-base font-semibold">
                                {reportType === 'history'
                                    ? 'Daily Usage Consumption Logs'
                                    : reportType === 'top_users'
                                    ? 'Top Consuming PPPoE Subscribers'
                                    : 'Router Wise Traffic Breakdown'}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Showing {filteredRecords.length} records recorded by system accounting
                            </CardDescription>
                        </div>

                        <div className="relative min-w-[220px]">
                            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                            <Input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Filter records..."
                                className="pl-8.5 h-8.5 text-xs"
                            />
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-y border-border/80 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {reportType === 'top_users' ? (
                                        <>
                                            <th className="py-3 px-4">Rank</th>
                                            <th className="py-3 px-4">PPPoE Account</th>
                                            <th className="py-3 px-4">Client Name</th>
                                            <th className="py-3 px-4">Package</th>
                                            <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">Download</th>
                                            <th className="py-3 px-4 text-sky-600 dark:text-sky-400">Upload</th>
                                            <th className="py-3 px-4">Total</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="py-3 px-4">Date</th>
                                            <th className="py-3 px-4">PPPoE Account</th>
                                            <th className="py-3 px-4">Client Name</th>
                                            <th className="py-3 px-4">Router Gateway</th>
                                            <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">Download</th>
                                            <th className="py-3 px-4 text-sky-600 dark:text-sky-400">Upload</th>
                                            <th className="py-3 px-4">Total</th>
                                            <th className="py-3 px-4">Uptime</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {reportQuery.isLoading ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-muted-foreground">
                                            <RefreshCw className="size-5 animate-spin mx-auto text-primary mb-2" />
                                            <span>Loading usage report...</span>
                                        </td>
                                    </tr>
                                ) : filteredRecords.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-muted-foreground">
                                            No report records found for this period.
                                        </td>
                                    </tr>
                                ) : reportType === 'top_users' ? (
                                    filteredRecords.map((r: any, idx: number) => (
                                        <tr key={`${r.username}-${idx}`} className="hover:bg-muted/40 transition-colors">
                                            <td className="py-3 px-4 font-mono font-bold">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] ${
                                                        r.rank === 1
                                                            ? 'border-amber-500 bg-amber-500/10 text-amber-600'
                                                            : r.rank === 2
                                                            ? 'border-slate-400 bg-slate-400/10 text-slate-400'
                                                            : r.rank === 3
                                                            ? 'border-amber-700 bg-amber-700/10 text-amber-700'
                                                            : ''
                                                    }`}
                                                >
                                                    #{r.rank}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 font-mono font-semibold text-primary">{r.username}</td>
                                            <td className="py-3 px-4 font-medium text-foreground">{r.client_name}</td>
                                            <td className="py-3 px-4">
                                                <Badge variant="outline" className="text-[10px]">
                                                    {r.package}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                                {r.download}
                                            </td>
                                            <td className="py-3 px-4 font-mono font-semibold text-sky-600 dark:text-sky-400">
                                                {r.upload}
                                            </td>
                                            <td className="py-3 px-4 font-mono font-bold text-foreground">{r.total}</td>
                                        </tr>
                                    ))
                                ) : (
                                    filteredRecords.map((r: any, idx: number) => (
                                        <tr key={`${r.username}-${r.date}-${idx}`} className="hover:bg-muted/40 transition-colors">
                                            <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">{r.date}</td>
                                            <td className="py-3 px-4 font-mono font-semibold text-primary">{r.username}</td>
                                            <td className="py-3 px-4 font-medium text-foreground">{r.client_name}</td>
                                            <td className="py-3 px-4 text-muted-foreground">{r.router_name}</td>
                                            <td className="py-3 px-4 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                                {r.download}
                                            </td>
                                            <td className="py-3 px-4 font-mono font-semibold text-sky-600 dark:text-sky-400">
                                                {r.upload}
                                            </td>
                                            <td className="py-3 px-4 font-mono font-bold text-foreground">{r.total}</td>
                                            <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">{r.uptime}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
