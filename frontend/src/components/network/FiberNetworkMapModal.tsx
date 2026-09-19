"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  MapPin,
  ExternalLink,
  Compass,
  Radio,
  Search,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface FiberCoreDetail {
  number: number;
  status: "free" | "used" | "damaged" | "reserved";
  colorName: string;
  note: string;
}

export interface FiberLineData {
  id: string;
  category: string;
  in_out: "In" | "Out";
  brand: string;
  code: string;
  cores: FiberCoreDetail[];
}

export interface MapTJBox {
  id: string;
  name: string;
  zone: string;
  category: "Master Box" | "Splitter Box" | "Zone/point Box";
  location: string;
  notes?: string;
  lines: FiberLineData[];
}

interface FiberNetworkMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxes: MapTJBox[];
}

const COLOR_MAP: Record<string, string> = {
  blue: "#1E90FF",
  orange: "#FFA500",
  green: "#32CD32",
  brown: "#8B4513",
  slate: "#708090",
  white: "#D3D3D3",
  red: "#FF0000",
  black: "#222222",
  yellow: "#D4AF37",
  violet: "#8A2BE2",
  rose: "#FF69B4",
  aqua: "#00CED1",
};

const COLOR_EMOJIS: Record<string, string> = {
  blue: "🔵",
  orange: "🟠",
  green: "🟢",
  brown: "🟤",
  slate: "🔘",
  white: "⚪",
  red: "🔴",
  black: "⚫",
  yellow: "🟡",
  violet: "🟣",
  rose: "🌸",
  aqua: "💧",
};

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function FiberNetworkMapModal({
  isOpen,
  onClose,
  boxes,
}: FiberNetworkMapModalProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  const [mapType, setMapType] = useState<"streets" | "satellite" | "dark">(
    "streets"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stats, setStats] = useState({
    plottedCount: 0,
    totalLines: 0,
    activeSpans: 0,
  });

  // Calculate coordinates & valid boxes
  const plottedBoxes = boxes.filter((b) => {
    if (!b.location || !b.location.includes(",")) return false;
    const parts = b.location.split(",").map((p) => parseFloat(p.trim()));
    return (
      parts.length === 2 &&
      !isNaN(parts[0]) &&
      !isNaN(parts[1]) &&
      Math.abs(parts[0]) <= 90 &&
      Math.abs(parts[1]) <= 180
    );
  });

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    let isMounted = true;

    async function initLeafletMap() {
      if (typeof window === "undefined") return;

      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (!isMounted || !mapContainerRef.current) return;

      // Clear existing map instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current.clear();
      }

      // Base Dhaka or first plotted box center
      let initialCenter: [number, number] = [23.8103, 90.4125];
      if (plottedBoxes.length > 0) {
        const firstParts = plottedBoxes[0].location
          .split(",")
          .map((p) => parseFloat(p.trim()));
        initialCenter = [firstParts[0], firstParts[1]];
      }

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 13,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      // Base tile layers
      const streetLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }
      );

      const satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "&copy; Esri World Imagery",
          maxZoom: 19,
        }
      );

      const darkLayer = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; CARTO dark",
          maxZoom: 19,
        }
      );

      if (mapType === "satellite") satelliteLayer.addTo(map);
      else if (mapType === "dark") darkLayer.addTo(map);
      else streetLayer.addTo(map);

      // Layer selector helper
      (map as any)._customLayers = {
        streets: streetLayer,
        satellite: satelliteLayer,
        dark: darkLayer,
      };

      const bounds: [number, number][] = [];
      const fiberGroups: Record<
        string,
        {
          points: [number, number][];
          color: string;
          brand: string;
          code: string;
        }
      > = {};

      let totalFibers = 0;

      // Plot Box Markers
      plottedBoxes.forEach((box) => {
        const parts = box.location.split(",").map((p) => parseFloat(p.trim()));
        const lat = parts[0];
        const lng = parts[1];
        const latLng: [number, number] = [lat, lng];
        bounds.push(latLng);

        // Marker color badge based on box category
        let markerColorClass = "bg-indigo-600 text-white";
        let categoryIcon = "📦";
        if (box.category === "Splitter Box") {
          markerColorClass = "bg-emerald-600 text-white";
          categoryIcon = "⚡";
        } else if (box.category === "Zone/point Box") {
          markerColorClass = "bg-amber-600 text-white";
          categoryIcon = "📍";
        }

        const iconHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;">
            <div style="position: absolute; inset: 0; border-radius: 9999px; opacity: 0.35; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; background-color: currentColor;" class="${markerColorClass}"></div>
            <div style="position: relative; width: 28px; height: 28px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3); border: 2px solid white;" class="${markerColorClass}">
              ${categoryIcon}
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: "custom-fiber-box-icon",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -18],
        });

        // Construct Rich Popup HTML matching legacy configuration.php
        let popupHtml = `
          <div style="min-width: 220px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; color: #1e293b; padding: 2px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 13px; color: #0f172a;">${escapeHtml(
                box.name
              )}</span>
              <span style="font-size: 10px; padding: 2px 6px; border-radius: 9999px; background-color: #f1f5f9; color: #475569; font-weight: 600;">${escapeHtml(
                box.category
              )}</span>
            </div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">
              <b>Zone:</b> ${escapeHtml(box.zone)}
            </div>
            ${
              box.notes
                ? `<div style="font-size: 10.5px; background: #fffbeb; color: #92400e; border: 1px solid #fef3c7; padding: 4px 6px; border-radius: 4px; margin-bottom: 6px;">
                     <b>Note:</b> ${escapeHtml(box.notes)}
                   </div>`
                : ""
            }
            <div style="font-size: 11px; font-weight: 600; color: #334155; margin-top: 6px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
              Optical Fiber Lines:
            </div>
        `;

        if (box.lines.length === 0) {
          popupHtml += `<div style="font-size: 10px; color: #94a3b8; font-style: italic;">No lines configured</div>`;
        } else {
          popupHtml += `<div style="max-height: 160px; overflow-y: auto; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">`;
          box.lines.forEach((line) => {
            totalFibers++;
            const firstCore = line.cores[0];
            const firstColor = firstCore?.colorName || "blue";
            const emoji = COLOR_EMOJIS[firstColor] || "⚙️";
            const catPretty = line.category.replace("core", " Core");
            const brandCode =
              [line.brand, line.code].filter(Boolean).join(" ") || line.code;
            const usedCount = line.cores.filter(
              (c) => c.status === "used"
            ).length;
            const freeCount = line.cores.filter(
              (c) => c.status === "free"
            ).length;

            popupHtml += `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 11px;">
                  <span>${emoji} ${escapeHtml(brandCode)}</span>
                  <span style="font-size: 9px; color: #6366f1;">[U:${usedCount}, F:${freeCount}]</span>
                </div>
                <div style="font-size: 9.5px; color: #64748b;">
                  ${catPretty} (${line.in_out})
                </div>
                <div style="margin-top: 2px; font-size: 9px; line-height: 1.2; color: #475569;">
                  ${line.cores
                    .map((c) => {
                      const cEmoji = COLOR_EMOJIS[c.colorName] || "⚪";
                      const statusColor =
                        c.status === "used" ? "#dc2626" : "#16a34a";
                      return `${cEmoji} C${c.number}: <span style="color: ${statusColor}; font-weight: 600;">${c.status}</span>${
                        c.note ? ` (${escapeHtml(c.note)})` : ""
                      }`;
                    })
                    .join("<br>")}
                </div>
              </div>
            `;
          });
          popupHtml += `</div>`;
        }

        popupHtml += `
          <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 4px; display: flex; justify-content: space-between; font-size: 10px;">
            <span style="color: #64748b; font-family: monospace;">${box.location}</span>
            <a href="https://www.google.com/maps?q=${encodeURIComponent(
              box.location
            )}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">
              Google Maps
            </a>
          </div>
        </div>
        `;

        const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
        marker.bindPopup(popupHtml, { maxWidth: 300 });
        markersRef.current.set(box.id, marker);

        // Group fiber lines across boxes for routing connections
        box.lines.forEach((f) => {
          const rawCode = (f.code || "").trim();
          if (rawCode) {
            const brand = (f.brand || "").trim();
            const firstColor = f.cores[0]?.colorName || "blue";

            if (!fiberGroups[rawCode]) {
              fiberGroups[rawCode] = {
                points: [],
                color: firstColor,
                brand,
                code: rawCode,
              };
            }
            const lastPt =
              fiberGroups[rawCode].points[
                fiberGroups[rawCode].points.length - 1
              ];
            if (!lastPt || lastPt[0] !== lat || lastPt[1] !== lng) {
              fiberGroups[rawCode].points.push(latLng);
            }
          }
        });
      });

      // Connect boxes sharing fiber codes
      let activeSpansCount = 0;
      Object.keys(fiberGroups).forEach((codeKey) => {
        const group = fiberGroups[codeKey];
        const points = group.points;
        const hexColor = COLOR_MAP[group.color] || "#6366f1";

        if (points.length >= 2) {
          activeSpansCount += points.length - 1;

          for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            const meters = calculateHaversineDistance(
              p1[0],
              p1[1],
              p2[0],
              p2[1]
            );
            const distDisplay =
              meters > 1000
                ? `${(meters / 1000).toFixed(2)} km`
                : `${meters} m`;

            // Draw dashed polyline connecting nodes
            const polyline = L.polyline([p1, p2], {
              color: hexColor,
              weight: 4,
              opacity: 0.85,
              dashArray: "6, 8",
            }).addTo(map);

            polyline.bindTooltip(
              `<b>Optical Fiber: ${escapeHtml(codeKey)}</b><br>Span: ${distDisplay} (Geodesic)`,
              { sticky: true }
            );

            // Center midpoint distance label
            const midLat = (p1[0] + p2[0]) / 2;
            const midLng = (p1[1] + p2[1]) / 2;
            const labelIcon = L.divIcon({
              className: "fiber-span-label",
              html: `
                <div style="background: rgba(15, 23, 42, 0.85); color: #38bdf8; border: 1px solid #38bdf8; font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 4px; white-space: nowrap; transform: translate(-50%, -50%); box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-family: monospace;">
                  ${distDisplay}
                </div>
              `,
              iconSize: [0, 0],
            });
            L.marker([midLat, midLng], {
              icon: labelIcon,
              interactive: false,
            }).addTo(map);

            // Attempt OSRM driving route enhancement asynchronously
            fetch(
              `https://router.project-osrm.org/route/v1/driving/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson`
            )
              .then((r) => r.json())
              .then((data) => {
                if (
                  data.routes &&
                  data.routes.length > 0 &&
                  mapInstanceRef.current
                ) {
                  const route = data.routes[0];
                  const coords = route.geometry.coordinates.map(
                    (c: [number, number]) => [c[1], c[0]] as [number, number]
                  );
                  const routeDist = route.distance;
                  const routeDistDisplay =
                    routeDist > 1000
                      ? `${(routeDist / 1000).toFixed(2)} km`
                      : `${Math.round(routeDist)} m`;

                  // Replace straight line with corridor route polyline
                  map.removeLayer(polyline);
                  const corridorLine = L.polyline(coords, {
                    color: hexColor,
                    weight: 5,
                    opacity: 0.9,
                  }).addTo(map);

                  corridorLine.bindTooltip(
                    `<b>Optical Fiber: ${escapeHtml(codeKey)}</b><br>Road Corridor: ${routeDistDisplay}`,
                    { sticky: true }
                  );
                }
              })
              .catch(() => {
                // Keep the dashed straight line fallback
              });
          }
        }
      });

      // Fit map bounds
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }

      setStats({
        plottedCount: plottedBoxes.length,
        totalLines: totalFibers,
        activeSpans: activeSpansCount,
      });
    }

    initLeafletMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, mapType, boxes]);

  const handleSwitchMapType = (type: "streets" | "satellite" | "dark") => {
    setMapType(type);
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const layers = (map as any)._customLayers;
    if (!layers) return;

    if (layers.streets) map.removeLayer(layers.streets);
    if (layers.satellite) map.removeLayer(layers.satellite);
    if (layers.dark) map.removeLayer(layers.dark);

    if (type === "satellite") layers.satellite.addTo(map);
    else if (type === "dark") layers.dark.addTo(map);
    else layers.streets.addTo(map);
  };

  const handleFlyToBox = (box: MapTJBox) => {
    if (!mapInstanceRef.current || !box.location) return;
    const parts = box.location.split(",").map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const map = mapInstanceRef.current;
      map.flyTo([parts[0], parts[1]], 16, { duration: 1.2 });
      const marker = markersRef.current.get(box.id);
      if (marker) {
        setTimeout(() => marker.openPopup(), 1300);
      }
    }
  };

  if (!isOpen) return null;

  const filteredTerminalList = plottedBoxes.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.zone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.lines.some((l) =>
        l.code.toLowerCase().includes(searchTerm.toLowerCase())
      )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen ? "h-[98vh] max-w-[98vw]" : "h-[90vh] max-w-6xl"
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/90">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20 font-bold">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Fiber Network Map & Distribution Routing
                </h3>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold"
                >
                  Live GIS Canvas
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Interactive optical fiber routing, joint terminals, and corridor
                span distance calculations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tile Layer Switcher */}
            <div className="hidden sm:flex items-center bg-muted/60 p-1 rounded-lg border border-border text-xs">
              <button
                onClick={() => handleSwitchMapType("streets")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  mapType === "streets"
                    ? "bg-background shadow-2xs font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Streets
              </button>
              <button
                onClick={() => handleSwitchMapType("satellite")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  mapType === "satellite"
                    ? "bg-background shadow-2xs font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Satellite
              </button>
              <button
                onClick={() => handleSwitchMapType("dark")}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  mapType === "dark"
                    ? "bg-background shadow-2xs font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Dark
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Map Body & Terminals Sidebar */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {/* Map Canvas */}
          <div className="flex-1 h-full w-full relative bg-slate-950">
            <div ref={mapContainerRef} className="h-full w-full z-0" />

            {/* Quick Stats Overlay Pill on Top-Left */}
            <div className="absolute top-3 left-3 z-10 bg-card/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-lg shadow-lg text-xs flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                {stats.plottedCount} Plotted Boxes
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="flex items-center gap-1.5 font-medium text-emerald-500">
                <Radio className="h-3.5 w-3.5" />
                {stats.activeSpans} Interlinked Spans
              </span>
            </div>
          </div>

          {/* Collapsible Sidebar: Plotted Terminals & Navigation */}
          <div className="w-full md:w-80 h-48 md:h-full border-t md:border-t-0 md:border-l border-border bg-card flex flex-col shrink-0">
            <div className="p-3 border-b border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">
                  Terminals ({filteredTerminalList.length})
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Click to fly
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Filter by name, zone, code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-7 text-xs bg-background"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-border/50">
              {filteredTerminalList.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No terminals matching query.
                </div>
              ) : (
                filteredTerminalList.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => handleFlyToBox(b)}
                    className="pt-1.5 first:pt-0 p-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer space-y-1 text-xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground group-hover:text-indigo-500 transition-colors truncate">
                        {b.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] bg-muted/60"
                      >
                        {b.category}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{b.zone}</span>
                      <span className="font-mono text-[9px] text-indigo-400">
                        {b.lines.length} Line{b.lines.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground/80">
                      <span className="truncate">{b.location}</span>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(
                          b.location
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-indigo-500 hover:text-indigo-600 inline-flex items-center gap-0.5"
                      >
                        GMaps <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Legend Footer */}
            <div className="p-2.5 border-t border-border bg-muted/30 text-[10px] space-y-1 text-muted-foreground">
              <div className="font-semibold text-foreground">
                Optical Terminal Legend:
              </div>
              <div className="grid grid-cols-2 gap-1">
                <span className="flex items-center gap-1">
                  📦 <span className="text-indigo-600 font-medium">Master</span>
                </span>
                <span className="flex items-center gap-1">
                  ⚡{" "}
                  <span className="text-emerald-600 font-medium">Splitter</span>
                </span>
                <span className="flex items-center gap-1">
                  📍 <span className="text-amber-600 font-medium">Point</span>
                </span>
                <span className="flex items-center gap-1">
                  ---{" "}
                  <span className="text-slate-600 font-medium">Fiber Span</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
