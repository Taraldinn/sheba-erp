"use client";

import React, { useState, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Activity, Pause, Play, RefreshCw, Wifi } from "lucide-react";
import { PortalApiClient } from "@/lib/portal-api";

interface TrafficPoint {
  time: string;
  download: number;
  upload: number;
}

interface LiveTrafficGraphProps {
  isLoggedIn?: boolean;
  isDemoMode?: boolean;
}

export function LiveTrafficGraph({ isLoggedIn = false, isDemoMode = false }: LiveTrafficGraphProps) {
  const [history, setHistory] = useState<TrafficPoint[]>(() => {
    if (!isDemoMode) return [];
    // Initialize 15 dummy points only when demo mode is active
    const now = Date.now();
    return Array.from({ length: 15 }).map((_, i) => {
      const t = new Date(now - (15 - i) * 2500);
      return {
        time: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        download: parseFloat((18 + Math.sin(i) * 6).toFixed(2)),
        upload: parseFloat((12 + Math.cos(i) * 4).toFixed(2)),
      };
    });
  });

  const [currentDown, setCurrentDown] = useState<number | null>(() => (isDemoMode ? 24.5 : null));
  const [currentUp, setCurrentUp] = useState<number | null>(() => (isDemoMode ? 14.2 : null));
  const [isOnline, setIsOnline] = useState<boolean | null>(() => (isDemoMode ? true : null));
  const [ipAddress, setIpAddress] = useState<string>(() => (isDemoMode ? "103.145.120.45" : "—"));
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [peakDown, setPeakDown] = useState<number>(() => (isDemoMode ? 28.4 : 0));
  const [peakUp, setPeakUp] = useState<number>(() => (isDemoMode ? 18.6 : 0));
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  useEffect(() => {
    let isActive = true;
    let reqGen = 0;

    if (!isPolling) {
      return () => {
        isActive = false;
      };
    }

    const fetchTraffic = async () => {
      const currentReq = ++reqGen;
      try {
        if (isLoggedIn) {
          if (!PortalApiClient.isAuthenticated()) {
            if (!isActive) return;
            setSessionExpired(true);
            setIsOnline(false);
            return;
          }
          setSessionExpired(false);
          const data = await PortalApiClient.getLiveTraffic();
          if (!isActive || currentReq !== reqGen) return;

          const down = data.download_mbps != null ? Number(data.download_mbps) : null;
          const up = data.upload_mbps != null ? Number(data.upload_mbps) : null;
          const nowStr = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          setCurrentDown(down);
          setCurrentUp(up);
          setIsOnline(data.is_online !== false);
          if (data.ip_address) setIpAddress(data.ip_address);

          if (down != null) setPeakDown((prev) => Math.max(prev, down));
          if (up != null) setPeakUp((prev) => Math.max(prev, up));

          if (down != null && up != null) {
            setHistory((prev) => {
              const next = [...prev.slice(-24), { time: nowStr, download: down, upload: up }];
              return next;
            });
          }
        } else if (isDemoMode) {
          // Simulated fluctuation for explicit demo mode only
          const down = parseFloat((20 + Math.random() * 10 - 2).toFixed(2));
          const up = parseFloat((12 + Math.random() * 6 - 1).toFixed(2));
          const nowStr = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          if (!isActive || currentReq !== reqGen) return;

          setCurrentDown(down);
          setCurrentUp(up);
          setPeakDown((prev) => Math.max(prev, down));
          setPeakUp((prev) => Math.max(prev, up));

          setHistory((prev) => {
            const next = [...prev.slice(-24), { time: nowStr, download: down, upload: up }];
            return next;
          });
        } else {
          // Unauthenticated and not in demo mode
          if (!isActive || currentReq !== reqGen) return;
          setIsOnline(false);
        }
      } catch (err) {
        if (!isActive || currentReq !== reqGen) return;
        console.error("Failed to poll live traffic:", err);
      }
    };

    fetchTraffic();
    const interval = setInterval(fetchTraffic, 2500);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [isPolling, isLoggedIn, isDemoMode]);

  // Compute SVG graph coordinates
  const effectivePeak = Math.max(peakDown, peakUp, currentDown || 0, currentUp || 0);
  const maxRate = Math.max(40, effectivePeak * 1.25);
  const svgWidth = 600;
  const svgHeight = 180;
  const paddingBottom = 20;
  const effectiveHeight = svgHeight - paddingBottom;

  const pointsDown = history.map((pt, idx) => {
    const x = (idx / (history.length - 1 || 1)) * svgWidth;
    const y = effectiveHeight - (pt.download / maxRate) * effectiveHeight;
    return `${x},${y}`;
  });

  const pointsUp = history.map((pt, idx) => {
    const x = (idx / (history.length - 1 || 1)) * svgWidth;
    const y = effectiveHeight - (pt.upload / maxRate) * effectiveHeight;
    return `${x},${y}`;
  });

  const polylineDown = pointsDown.join(" ");
  const polylineUp = pointsUp.join(" ");

  const areaDown = pointsDown.length > 0 ? `0,${effectiveHeight} ${polylineDown} ${svgWidth},${effectiveHeight}` : "";
  const areaUp = pointsUp.length > 0 ? `0,${effectiveHeight} ${polylineUp} ${svgWidth},${effectiveHeight}` : "";

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-card/80 p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-400 animate-pulse" />
            <h3 className="text-sm font-bold text-foreground">Live Optical Traffic & Bandwidth</h3>
            {sessionExpired ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Session Expired
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className={`h-1.5 w-1.5 rounded-full ${isPolling ? "bg-emerald-400 animate-ping" : "bg-muted-foreground"}`} />
                {isPolling ? "Live Feed (2.5s)" : "Paused"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Subscribed Interface WAN IP: <span className="font-mono text-indigo-400 font-semibold">{ipAddress}</span> • Interface: <span className="font-mono text-foreground font-semibold">pppoe-wan</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPolling(!isPolling)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted/40 text-foreground transition-all cursor-pointer"
          >
            {isPolling ? (
              <>
                <Pause className="h-3 w-3 text-amber-400" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3 w-3 text-emerald-400" /> Resume
              </>
            )}
          </button>
        </div>
      </div>

      {/* Real-time Rate Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-1.5 text-blue-400 text-[11px] font-bold">
            <ArrowDown className="h-3.5 w-3.5" /> Download Rate
          </div>
          <p className="text-2xl font-black font-mono text-foreground mt-1">
            {currentDown != null ? currentDown.toFixed(1) : "—"} <span className="text-xs font-bold text-blue-400">Mbps</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Peak: <span className="font-mono text-blue-300 font-semibold">{peakDown > 0 ? `${peakDown.toFixed(1)} Mbps` : "—"}</span>
          </p>
        </div>

        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-1.5 text-purple-400 text-[11px] font-bold">
            <ArrowUp className="h-3.5 w-3.5" /> Upload Rate
          </div>
          <p className="text-2xl font-black font-mono text-foreground mt-1">
            {currentUp != null ? currentUp.toFixed(1) : "—"} <span className="text-xs font-bold text-purple-400">Mbps</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Peak: <span className="font-mono text-purple-300 font-semibold">{peakUp > 0 ? `${peakUp.toFixed(1)} Mbps` : "—"}</span>
          </p>
        </div>

        <div className="p-3 rounded-xl bg-card border border-border">
          <p className="text-[11px] font-semibold text-muted-foreground">Gateway Status</p>
          <p className="text-sm font-bold text-foreground mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${sessionExpired ? "bg-rose-500" : isOnline === true ? "bg-emerald-400" : isOnline === false ? "bg-rose-500" : "bg-amber-400"}`} />
            {sessionExpired ? "Session Expired" : isOnline === true ? "BDIX Connected" : isOnline === false ? "Link Down" : "Connecting..."}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Sampling: MikroTik Core</p>
        </div>

        <div className="p-3 rounded-xl bg-card border border-border">
          <p className="text-[11px] font-semibold text-muted-foreground">Rolling Samples</p>
          <p className="text-sm font-bold font-mono text-foreground mt-1">{history.length} snapshots</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Buffer: Last 60s</p>
        </div>
      </div>

      {/* SVG Real-Time Rolling Bandwidth Chart */}
      <div className="relative rounded-xl border border-border/60 bg-background/80 p-3 overflow-hidden">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Download Bandwidth (Mbps)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              Upload Bandwidth (Mbps)
            </span>
          </div>
          <span className="font-mono">Max: {maxRate.toFixed(0)} Mbps</span>
        </div>

        <div className="w-full h-44 relative">
          {history.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground z-10 pointer-events-none">
              {sessionExpired ? "Session expired — please log in again" : "Awaiting live telemetry..."}
            </div>
          )}
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="downGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="upGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line x1="0" y1={effectiveHeight * 0.25} x2={svgWidth} y2={effectiveHeight * 0.25} stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1="0" y1={effectiveHeight * 0.5} x2={svgWidth} y2={effectiveHeight * 0.5} stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1="0" y1={effectiveHeight * 0.75} x2={svgWidth} y2={effectiveHeight * 0.75} stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1="0" y1={effectiveHeight} x2={svgWidth} y2={effectiveHeight} stroke="#475569" strokeOpacity="0.6" />

            {/* Download Area & Line */}
            <polygon points={areaDown} fill="url(#downGradient)" />
            <polyline
              points={polylineDown}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Upload Area & Line */}
            <polygon points={areaUp} fill="url(#upGradient)" />
            <polyline
              points={polylineUp}
              fill="none"
              stroke="#a855f7"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono mt-1 pt-1 border-t border-border/40">
          <span>{history[0]?.time || "Start"}</span>
          <span>Rolling Live Telemetry</span>
          <span>{history[history.length - 1]?.time || "Now"}</span>
        </div>
      </div>
    </div>
  );
}
