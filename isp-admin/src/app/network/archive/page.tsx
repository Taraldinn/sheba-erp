"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Calendar,
  FileDown,
  FileJson,
  Filter,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiClient } from "@/lib/api";
import {
  Router,
  ArchiveKind,
  ArchiveRow,
  ArchiveQueryParams,
  ArchiveQueryResponse,
  ArchiveExportFormat,
} from "@/types";

const KIND_LABELS: Record<ArchiveKind, string> = {
  sessions: "Disconnected Sessions",
  actions: "Network Actions / Jobs",
  interfaces: "Interface Snapshots",
  pings: "Ping Attempts",
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
};

const formatBytes = (bytes: number | undefined) => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
};

export default function ArchivePage() {
  const [kind, setKind] = useState<ArchiveKind>("sessions");
  const [dateFrom, setDateFrom] = useState<string>(daysAgoIso(7));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [routerId, setRouterId] = useState<string>("");
  const [username, setUsername] = useState("");
  const [routers, setRouters] = useState<Router[]>([]);
  const [data, setData] = useState<ArchiveQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const limit = 50;

  // Load routers for the dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await ApiClient.getRouters();
        if (!cancelled) setRouters(list || []);
      } catch {
        if (!cancelled) {
          // Non-fatal — router filter just becomes unusable.
          setRouters([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const query = useCallback(
    async (nextOffset: number = 0) => {
      setLoading(true);
      setError(null);
      const params: ArchiveQueryParams = {
        type: kind,
        date_from: dateFrom,
        date_to: dateTo,
        limit,
        offset: nextOffset,
      };
      if (routerId) params.router_id = routerId;
      if (username.trim()) params.username = username.trim();
      try {
        const res = await ApiClient.queryArchive(params);
        setData(res);
        setOffset(nextOffset);
      } catch (err) {
        setData(null);
        setError((err as Error).message || "Failed to load archive");
      } finally {
        setLoading(false);
      }
    },
    [kind, dateFrom, dateTo, routerId, username]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    query(0);
  }, [query]);

  const handleExport = useCallback(
    async (format: ArchiveExportFormat) => {
      setExporting(format);
      try {
        const { blob, filename } = await ApiClient.exportArchive({
          type: kind,
          date_from: dateFrom,
          date_to: dateTo,
          router_id: routerId || undefined,
          username: username.trim() || undefined,
          export_format: format,
        });
        ApiClient.triggerBlobDownload(blob, filename);
      } catch (err) {
        setError((err as Error).message || `Export (${format}) failed`);
      } finally {
        setExporting(null);
      }
    },
    [kind, dateFrom, dateTo, routerId, username]
  );

  const totalPages = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, Math.ceil(data.count / limit));
  }, [data]);

  const currentPage = useMemo(() => Math.floor(offset / limit) + 1, [offset]);

  const reset = useCallback(() => {
    setKind("sessions");
    setDateFrom(daysAgoIso(7));
    setDateTo(todayIso());
    setRouterId("");
    setUsername("");
    setOffset(0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Archive className="h-7 w-7 text-indigo-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Archive & Export
            </h1>
            <Badge variant="outline" className="ml-2 border-indigo-300 text-indigo-700">
              Admin
            </Badge>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Browse and download datewise records for disconnected sessions,
            network actions, daily interface snapshots, and ping attempts.
            Filters apply to both the on-screen table and the export.
          </p>
        </header>

        {/* Filter bar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" /> Filters
            </CardTitle>
            <CardDescription className="text-xs">
              Adjust the date range, source, router, and username to scope
              the archive. Exports honour every active filter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  Source
                </label>
                <Select
                  value={kind}
                  onValueChange={(v) => v && setKind(v as ArchiveKind)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABELS) as ArchiveKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  From
                </label>
                <div className="relative mt-1">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  To
                </label>
                <div className="relative mt-1">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  Router
                </label>
                <Select
                  value={routerId || "any"}
                  onValueChange={(v) => setRouterId((!v || v === "any" ? "" : v) as string)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Any router" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any router</SelectItem>
                    {routers.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({r.ip_address})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  Username / Target
                </label>
                <div className="relative mt-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="optional"
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button onClick={() => query(0)} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-1">Apply</span>
                </Button>
                <Button variant="outline" onClick={reset} disabled={loading}>
                  <X className="h-4 w-4" />
                  <span className="ml-1">Reset</span>
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleExport("csv")}
                  disabled={loading || exporting !== null}
                >
                  {exporting === "csv" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  <span className="ml-1">Download CSV</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport("json")}
                  disabled={loading || exporting !== null}
                >
                  {exporting === "json" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileJson className="h-4 w-4" />
                  )}
                  <span className="ml-1">Download JSON</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                {KIND_LABELS[kind]}
              </CardTitle>
              <CardDescription className="text-xs">
                {data
                  ? `${data.count.toLocaleString()} record${data.count === 1 ? "" : "s"} between ${data.date_from} and ${data.date_to}`
                  : "Loading…"}
              </CardDescription>
            </div>
            {data && totalPages > 1 ? (
              <div className="flex items-center gap-2 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => query(Math.max(0, offset - limit))}
                  disabled={loading || offset === 0}
                >
                  Previous
                </Button>
                <span className="text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => query(offset + limit)}
                  disabled={loading || offset + limit >= data.count}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200">
                {error}
              </div>
            )}
            <ArchiveTable rows={data?.results || []} loading={loading} kind={kind} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ArchiveTable({
  rows,
  loading,
  kind,
}: {
  rows: ArchiveRow[];
  loading: boolean;
  kind: ArchiveKind;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
      </div>
    );
  }
  if (!loading && rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        No records found for this filter.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
          {kind === "sessions" && <SessionHeader />}
          {kind === "actions" && <ActionsHeader />}
          {kind === "interfaces" && <InterfacesHeader />}
          {kind === "pings" && <PingsHeader />}
        </thead>
        <tbody>
          {kind === "sessions" && rows.map((r, idx) => <SessionRow key={`${r.id}-${idx}`} row={r} />)}
          {kind === "actions" && rows.map((r, idx) => <ActionRow key={`${r.id}-${idx}`} row={r} />)}
          {kind === "interfaces" && rows.map((r, idx) => <InterfaceRow key={`${r.id}-${idx}`} row={r} />)}
          {kind === "pings" && rows.map((r, idx) => <PingRow key={`${r.id}-${idx}`} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left px-3 py-2 ${className}`}>{children}</th>
  );
}

function SessionHeader() {
  return (
    <tr>
      <Th>When</Th>
      <Th>Router</Th>
      <Th>Username</Th>
      <Th>IP</Th>
      <Th>MAC</Th>
      <Th>Duration</Th>
      <Th className="text-right">RX</Th>
      <Th className="text-right">TX</Th>
      <Th>Cause</Th>
    </tr>
  );
}

function SessionRow({ row }: { row: ArchiveRow }) {
  const duration = row.duration_seconds ?? 0;
  const h = Math.floor(duration / 3600);
  const m = Math.floor((duration % 3600) / 60);
  const s = duration % 60;
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      <td className="px-3 py-2 text-xs">{formatDateTime(row.occurred_at)}</td>
      <td className="px-3 py-2">{row.router_name || "—"}</td>
      <td className="px-3 py-2 font-mono">{row.username || "—"}</td>
      <td className="px-3 py-2 font-mono">{row.ip_address || "—"}</td>
      <td className="px-3 py-2 font-mono text-xs">{row.mac_address || "—"}</td>
      <td className="px-3 py-2">
        {h > 0 ? `${h}h ` : ""}
        {m}m {s}s
      </td>
      <td className="px-3 py-2 text-right">{formatBytes(row.bytes_in)}</td>
      <td className="px-3 py-2 text-right">{formatBytes(row.bytes_out)}</td>
      <td className="px-3 py-2 text-xs">{row.terminate_cause || "—"}</td>
    </tr>
  );
}

function ActionsHeader() {
  return (
    <tr>
      <Th>When</Th>
      <Th>Router</Th>
      <Th>Action</Th>
      <Th>Status</Th>
      <Th>Actor</Th>
      <Th>Target</Th>
      <Th>Error</Th>
    </tr>
  );
}

function ActionRow({ row }: { row: ArchiveRow }) {
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      <td className="px-3 py-2 text-xs">{formatDateTime(row.occurred_at)}</td>
      <td className="px-3 py-2">{row.router_name || "—"}</td>
      <td className="px-3 py-2 font-medium">{row.action || "—"}</td>
      <td className="px-3 py-2">
        <Badge variant={row.status === "SUCCEEDED" || row.status === "SUCCESS" ? "default" : "secondary"}>
          {row.status || "—"}
        </Badge>
      </td>
      <td className="px-3 py-2 text-xs">{row.actor || "—"}</td>
      <td className="px-3 py-2 text-xs">
        {row.target_name || row.target_id || "—"}
      </td>
      <td className="px-3 py-2 text-xs text-rose-600 truncate max-w-[260px]">
        {row.error_message || "—"}
      </td>
    </tr>
  );
}

function InterfacesHeader() {
  return (
    <tr>
      <Th>Snapshot</Th>
      <Th>Router</Th>
      <Th>Interfaces</Th>
      <Th>Up / Down</Th>
      <Th>Errors</Th>
      <Th>Error</Th>
    </tr>
  );
}

function InterfaceRow({ row }: { row: ArchiveRow }) {
  const interfaces = (row.interfaces as unknown as Array<Record<string, unknown>>) || [];
  const up = interfaces.filter((i) => i.running).length;
  const down = interfaces.filter((i) => !i.running && !i.disabled).length;
  const errors = interfaces.reduce(
    (acc, i) => acc + Number(i.rx_errors || 0) + Number(i.tx_errors || 0),
    0
  );
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800 align-top">
      <td className="px-3 py-2 text-xs">
        <div>{row.snapshot_date}</div>
        <div className="text-slate-500">{formatDateTime(row.occurred_at)}</div>
      </td>
      <td className="px-3 py-2">{row.router_name || "—"}</td>
      <td className="px-3 py-2 text-xs font-mono">
        {interfaces.slice(0, 6).map((i) => i.name).filter(Boolean).join(", ")}
        {interfaces.length > 6 ? `, +${interfaces.length - 6} more` : ""}
      </td>
      <td className="px-3 py-2 text-xs">
        <Badge variant="outline" className="mr-1 text-[10px] border-emerald-300 text-emerald-700">
          {up} up
        </Badge>
        {down > 0 ? (
          <Badge variant="destructive" className="text-[10px]">
            {down} down
          </Badge>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs">{errors > 0 ? errors : "0"}</td>
      <td className="px-3 py-2 text-xs text-rose-600 truncate max-w-[200px]">
        {row.error_message || "—"}
      </td>
    </tr>
  );
}

function PingsHeader() {
  return (
    <tr>
      <Th>When</Th>
      <Th>Router</Th>
      <Th>Target</Th>
      <Th>Status</Th>
      <Th className="text-right">Recv / Sent</Th>
      <Th className="text-right">Avg (ms)</Th>
      <Th className="text-right">Min (ms)</Th>
      <Th className="text-right">Max (ms)</Th>
      <Th>By</Th>
    </tr>
  );
}

function PingRow({ row }: { row: ArchiveRow }) {
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      <td className="px-3 py-2 text-xs">{formatDateTime(row.occurred_at)}</td>
      <td className="px-3 py-2">{row.router_name || "—"}</td>
      <td className="px-3 py-2 font-mono">{row.target || "—"}</td>
      <td className="px-3 py-2">
        <Badge variant={row.status === "SUCCESS" ? "default" : "destructive"}>
          {row.status || "—"}
        </Badge>
      </td>
      <td className="px-3 py-2 text-right">
        {row.received ?? 0}/{row.packet_count ?? 0}
      </td>
      <td className="px-3 py-2 text-right">
        {row.avg_latency_ms != null ? row.avg_latency_ms.toFixed(2) : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        {row.min_latency_ms != null ? row.min_latency_ms.toFixed(2) : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        {row.max_latency_ms != null ? row.max_latency_ms.toFixed(2) : "—"}
      </td>
      <td className="px-3 py-2 text-xs">{row.ran_by || "—"}</td>
    </tr>
  );
}
