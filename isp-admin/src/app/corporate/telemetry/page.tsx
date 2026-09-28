"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  RefreshCw,
  Clock,
  ArrowDown,
  ArrowUp,
  BarChart3,
  TrendingUp,
  Radio,
  Sliders,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { CorporateConnection, MRTGDataPoint } from "@/types";

export default function CorporateTelemetryPage() {
  const [connections, setConnections] = useState<CorporateConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [hours, setHours] = useState<number>(24);
  const [dataPoints, setDataPoints] = useState<MRTGDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    ApiClient.getCorporateConnections().then((conns) => {
      setConnections(conns);
      if (conns.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(conns[0].id);
      }
    });
  }, []);

  const loadGraphData = async () => {
    if (!selectedConnectionId) return;
    setLoading(true);
    try {
      const res = await ApiClient.getCorporateMRTGGraph({
        connection_id: selectedConnectionId,
        hours,
      });
      setDataPoints(res.points || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraphData();
  }, [selectedConnectionId, hours]);

  useEffect(() => {
    let timer: any;
    if (autoRefresh) {
      timer = setInterval(loadGraphData, 30000); // 30s auto-refresh
    }
    return () => clearInterval(timer);
  }, [autoRefresh, selectedConnectionId, hours]);

  // Statistics calculation
  const stats = useMemo(() => {
    if (dataPoints.length === 0) {
      return {
        curIn: 0,
        curOut: 0,
        maxIn: 0,
        maxOut: 0,
        avgIn: 0,
        avgOut: 0,
        p95: 0,
      };
    }
    const inVals = dataPoints.map((p) => p.inbound_mbps);
    const outVals = dataPoints.map((p) => p.outbound_mbps);
    const maxVals = dataPoints.map((p) => p.max_mbps);

    const curIn = inVals[inVals.length - 1];
    const curOut = outVals[outVals.length - 1];
    const maxIn = Math.max(...inVals);
    const maxOut = Math.max(...outVals);
    const avgIn = inVals.reduce((a, b) => a + b, 0) / inVals.length;
    const avgOut = outVals.reduce((a, b) => a + b, 0) / outVals.length;

    const sortedMax = [...maxVals].sort((a, b) => a - b);
    const p95Idx = Math.max(0, Math.ceil(0.95 * sortedMax.length) - 1);
    const p95 = sortedMax[p95Idx] || 0;

    return { curIn, curOut, maxIn, maxOut, avgIn, avgOut, p95 };
  }, [dataPoints]);

  const selectedConn = connections.find((c) => c.id === selectedConnectionId);

  // SVG Chart Dimensions
  const chartWidth = 900;
  const chartHeight = 320;
  const padding = { top: 20, right: 30, bottom: 40, left: 55 };
  const graphW = chartWidth - padding.left - padding.right;
  const graphH = chartHeight - padding.top - padding.bottom;

  const yMax = Math.max(
    10,
    Math.ceil(Math.max(...dataPoints.map((p) => p.max_mbps), stats.p95, selectedConn?.committed_bandwidth_mbps || 0) * 1.2)
  );

  const getX = (index: number) => {
    if (dataPoints.length <= 1) return padding.left;
    return padding.left + (index / (dataPoints.length - 1)) * graphW;
  };

  const getY = (val: number) => {
    return padding.top + graphH - (val / yMax) * graphH;
  };

  const inAreaPoints = dataPoints.map((p, i) => `${getX(i)},${getY(p.inbound_mbps)}`).join(" ");
  const inAreaSvg =
    dataPoints.length > 0
      ? `${padding.left},${padding.top + graphH} ${inAreaPoints} ${getX(dataPoints.length - 1)},${padding.top + graphH}`
      : "";

  const outLinePoints = dataPoints.map((p, i) => `${getX(i)},${getY(p.outbound_mbps)}`).join(" ");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-1 uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            Telemetry & MRTG Engine
          </div>
          <h1 className="text-3xl font-bold tracking-tight">MRTG Bandwidth Monitoring</h1>
          <p className="text-muted-foreground text-sm mt-1">
            High-resolution 5-minute time-series telemetry with dynamic 95th-percentile billing threshold.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="gap-2 text-xs"
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? "text-emerald-400 animate-pulse" : ""}`} />
            {autoRefresh ? "Auto (30s) On" : "Auto-Refresh Off"}
          </Button>
          <Button variant="outline" size="sm" onClick={loadGraphData} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Control Selector Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Circuit:</label>
            <select
              value={selectedConnectionId}
              onChange={(e) => setSelectedConnectionId(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm bg-background text-foreground font-medium min-w-[260px]"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.circuit_id} — {c.name} ({c.committed_bandwidth_mbps} Mbps)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Time Horizon:</label>
            {[
              { label: "1h", val: 1 },
              { label: "6h", val: 6 },
              { label: "24h", val: 24 },
              { label: "7d", val: 168 },
              { label: "30d", val: 720 },
            ].map((t) => (
              <Button
                key={t.val}
                variant={hours === t.val ? "default" : "outline"}
                size="sm"
                onClick={() => setHours(t.val)}
                className="h-8 px-3 text-xs"
              >
                {t.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <ArrowDown className="w-3 h-3" /> Current In
          </div>
          <div className="text-lg font-bold mt-1 text-emerald-700 dark:text-emerald-300">
            {stats.curIn.toFixed(2)} Mbps
          </div>
        </div>

        <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <ArrowUp className="w-3 h-3" /> Current Out
          </div>
          <div className="text-lg font-bold mt-1 text-blue-700 dark:text-blue-300">
            {stats.curOut.toFixed(2)} Mbps
          </div>
        </div>

        <div className="p-3.5 bg-muted/40 border rounded-xl">
          <div className="text-[11px] font-semibold text-muted-foreground">Peak Inbound</div>
          <div className="text-lg font-bold mt-1">{stats.maxIn.toFixed(2)} Mbps</div>
        </div>

        <div className="p-3.5 bg-muted/40 border rounded-xl">
          <div className="text-[11px] font-semibold text-muted-foreground">Peak Outbound</div>
          <div className="text-lg font-bold mt-1">{stats.maxOut.toFixed(2)} Mbps</div>
        </div>

        <div className="p-3.5 bg-muted/40 border rounded-xl">
          <div className="text-[11px] font-semibold text-muted-foreground">Avg Throughput</div>
          <div className="text-lg font-bold mt-1">{((stats.avgIn + stats.avgOut) / 2).toFixed(2)} Mbps</div>
        </div>

        <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Committed CIR</div>
          <div className="text-lg font-bold mt-1 text-indigo-700 dark:text-indigo-300">
            {selectedConn?.committed_bandwidth_mbps || 0} Mbps
          </div>
        </div>

        <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">95th Percentile</div>
          <div className="text-lg font-bold mt-1 text-red-600 dark:text-red-400">
            {stats.p95.toFixed(2)} Mbps
          </div>
        </div>
      </div>

      {/* MRTG Canvas / SVG Chart */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Multi-Circuit Traffic Graph ({selectedConn?.circuit_id})
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {selectedConn?.name} • Router: {selectedConn?.router_name} ({selectedConn?.interface_name})
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500/60 inline-block border border-emerald-600"></span>
                <span>Inbound (bps)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1 bg-blue-500 inline-block"></span>
                <span>Outbound (bps)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1 bg-red-500 border-b border-dashed border-red-500 inline-block"></span>
                <span className="text-red-500 font-semibold">95th Line ({stats.p95.toFixed(1)}M)</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {dataPoints.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
              <Activity className="w-8 h-8 mb-2 opacity-30 animate-pulse" />
              <span>No telemetry samples recorded for the selected time horizon.</span>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto max-h-[380px]">
                {/* Horizontal Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, idx) => {
                  const val = yMax * ratio;
                  const yPos = getY(val);
                  return (
                    <g key={idx}>
                      <line
                        x1={padding.left}
                        y1={yPos}
                        x2={chartWidth - padding.right}
                        y2={yPos}
                        stroke="currentColor"
                        strokeOpacity="0.08"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padding.left - 8}
                        y={yPos + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="currentColor"
                        opacity="0.5"
                        fontFamily="monospace"
                      >
                        {Math.round(val)}M
                      </text>
                    </g>
                  );
                })}

                {/* Inbound Area (Green fill) */}
                <polygon points={inAreaSvg} fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="1.5" />

                {/* Outbound Line (Blue stroke) */}
                <polyline points={outLinePoints} fill="none" stroke="#3b82f6" strokeWidth="1.8" />

                {/* P95 Line (Red Dashed) */}
                {stats.p95 > 0 && (
                  <g>
                    <line
                      x1={padding.left}
                      y1={getY(stats.p95)}
                      x2={chartWidth - padding.right}
                      y2={getY(stats.p95)}
                      stroke="#ef4444"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                    <rect
                      x={chartWidth - padding.right - 80}
                      y={getY(stats.p95) - 18}
                      width="75"
                      height="16"
                      rx="3"
                      fill="#ef4444"
                    />
                    <text
                      x={chartWidth - padding.right - 42}
                      y={getY(stats.p95) - 6}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#ffffff"
                      fontWeight="bold"
                    >
                      P95: {stats.p95.toFixed(1)}M
                    </text>
                  </g>
                )}

                {/* X-axis labels (time) */}
                {dataPoints.length > 0 && (
                  <>
                    <text
                      x={padding.left}
                      y={chartHeight - 12}
                      textAnchor="start"
                      fontSize="10"
                      fill="currentColor"
                      opacity="0.5"
                    >
                      {new Date(dataPoints[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </text>
                    <text
                      x={padding.left + graphW / 2}
                      y={chartHeight - 12}
                      textAnchor="middle"
                      fontSize="10"
                      fill="currentColor"
                      opacity="0.5"
                    >
                      {new Date(dataPoints[Math.floor(dataPoints.length / 2)].timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </text>
                    <text
                      x={chartWidth - padding.right}
                      y={chartHeight - 12}
                      textAnchor="end"
                      fontSize="10"
                      fill="currentColor"
                      opacity="0.5"
                    >
                      {new Date(dataPoints[dataPoints.length - 1].timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </text>
                  </>
                )}
              </svg>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
