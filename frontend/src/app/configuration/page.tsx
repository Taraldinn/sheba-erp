"use client";

import { useState } from "react";
import {
  Settings,
  MapPin,
  Plus,
  Search,
  Map,
  Trash2,
  ChevronDown,
  ChevronUp,
  Radio,
  Network,
  Server,
  Layers,
  CheckCircle2,
  X,
  Compass,
  Cpu,
  Shield,
  Bell,
  Save,
  Navigation,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Optical fiber core standard color codes
const FIBER_CORE_COLORS = [
  { name: "Blue", bg: "bg-blue-500", border: "border-blue-600" },
  { name: "Orange", bg: "bg-orange-500", border: "border-orange-600" },
  { name: "Green", bg: "bg-emerald-500", border: "border-emerald-600" },
  { name: "Brown", bg: "bg-amber-800", border: "border-amber-900" },
  { name: "Slate", bg: "bg-slate-400", border: "border-slate-500" },
  { name: "White", bg: "bg-white", border: "border-slate-300" },
  { name: "Red", bg: "bg-red-500", border: "border-red-600" },
  { name: "Black", bg: "bg-slate-900", border: "border-slate-700" },
  { name: "Yellow", bg: "bg-yellow-400", border: "border-yellow-500" },
  { name: "Violet", bg: "bg-purple-500", border: "border-purple-600" },
  { name: "Pink", bg: "bg-pink-400", border: "border-pink-500" },
  { name: "Aqua", bg: "bg-cyan-400", border: "border-cyan-500" },
];

interface CoreConfig {
  number: number;
  status: "Free" | "Used" | "Damaged" | "Reserved";
  colorName: string;
  note: string;
}

interface FiberLine {
  id: string;
  coreCount: number;
  direction: "In" | "Out";
  brand: string;
  code: string;
  cores: CoreConfig[];
}

interface TJBox {
  id: string;
  name: string;
  zone: string;
  category: string;
  lines: FiberLine[];
  notes: string;
  location: string;
  created_at: string;
}

interface Zone {
  id: string;
  name: string;
  code: string;
  description: string;
  boxes_count: number;
}

const initialZones: Zone[] = [
  { id: "z-1", name: "Zone 1 - Uttara Sector 10", code: "Z-UTT-10", description: "Central optical distribution ring covering Sector 10 & 11", boxes_count: 4 },
  { id: "z-2", name: "Zone 2 - Mirpur 10 NOC", code: "Z-MIR-10", description: "Primary backbone hub & residential sub-rings", boxes_count: 6 },
  { id: "z-3", name: "Zone 3 - Dhanmondi 27 Hub", code: "Z-DHN-27", description: "Commercial enterprise optical lines", boxes_count: 2 },
];

const initialBoxes: TJBox[] = [
  {
    id: "box-1",
    name: "BOX-A1 (Main Splitter)",
    zone: "Zone 1 - Uttara Sector 10",
    category: "Master Box",
    location: "23.8728, 90.3984",
    notes: "SubZone-1, SubZone-2, Road 11 Junction",
    created_at: "2026-08-15",
    lines: [
      {
        id: "l-1",
        coreCount: 4,
        direction: "In",
        brand: "FiberHome",
        code: "F-MAIN-01",
        cores: [
          { number: 1, status: "Used", colorName: "Blue", note: "OLT Port 1/1 Feed" },
          { number: 2, status: "Used", colorName: "Orange", note: "OLT Port 1/2 Feed" },
          { number: 3, status: "Free", colorName: "Green", note: "Standby Core" },
          { number: 4, status: "Free", colorName: "Brown", note: "Standby Core" },
        ],
      },
      {
        id: "l-2",
        coreCount: 2,
        direction: "Out",
        brand: "Corning",
        code: "F-SEC-02",
        cores: [
          { number: 1, status: "Used", colorName: "Blue", note: "Splitter 1:8 to Road 12" },
          { number: 2, status: "Free", colorName: "Orange", note: "Spare link" },
        ],
      },
    ],
  },
  {
    id: "box-2",
    name: "BOX-M2 (Mirpur Ring 2)",
    zone: "Zone 2 - Mirpur 10 NOC",
    category: "Distribution TJ Box",
    location: "23.8069, 90.3687",
    notes: "Block C, Metro Pole #42",
    created_at: "2026-08-20",
    lines: [
      {
        id: "l-3",
        coreCount: 2,
        direction: "In",
        brand: "Sterlite",
        code: "ST-MIR-01",
        cores: [
          { number: 1, status: "Used", colorName: "Blue", note: "Core Trunk" },
          { number: 2, status: "Reserved", colorName: "Orange", note: "Corporate SLA Reserve" },
        ],
      },
    ],
  },
];

export default function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState<"optical" | "billing" | "sms">("optical");
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [boxes, setBoxes] = useState<TJBox[]>(initialBoxes);
  const [search, setSearch] = useState("");

  // Modal States
  const [isBoxModalOpen, setIsBoxModalOpen] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  // New Zone Form State
  const [newZone, setNewZone] = useState({ name: "", code: "", description: "" });

  // New TJ Box Form State
  const [newBoxName, setNewBoxName] = useState("");
  const [newBoxZone, setNewBoxZone] = useState(zones[0]?.name || "");
  const [newBoxCategory, setNewBoxCategory] = useState("Master Box");
  const [newBoxNotes, setNewBoxNotes] = useState("SubZone-1, SubZone-2");
  const [newBoxLocation, setNewBoxLocation] = useState("23.8728, 90.3984");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const [lines, setLines] = useState<FiberLine[]>([
    {
      id: "line_1",
      coreCount: 2,
      direction: "In",
      brand: "",
      code: "",
      cores: [
        { number: 1, status: "Free", colorName: "Blue", note: "" },
        { number: 2, status: "Free", colorName: "Orange", note: "" },
      ],
    },
  ]);

  // Add line to form
  const handleAddLine = () => {
    const newLineId = `line_${Date.now()}`;
    setLines([
      ...lines,
      {
        id: newLineId,
        coreCount: 2,
        direction: "Out",
        brand: "",
        code: "",
        cores: [
          { number: 1, status: "Free", colorName: "Blue", note: "" },
          { number: 2, status: "Free", colorName: "Orange", note: "" },
        ],
      },
    ]);
  };

  // Remove line from form
  const handleRemoveLine = (lineId: string) => {
    if (lines.length === 1) return;
    setLines(lines.filter((l) => l.id !== lineId));
  };

  // Change core count on a line
  const handleLineCoreCountChange = (lineId: string, count: number) => {
    setLines(
      lines.map((l) => {
        if (l.id !== lineId) return l;
        const newCores: CoreConfig[] = [];
        for (let i = 0; i < count; i++) {
          const existing = l.cores[i];
          const color = FIBER_CORE_COLORS[i % FIBER_CORE_COLORS.length];
          newCores.push({
            number: i + 1,
            status: existing ? existing.status : "Free",
            colorName: color.name,
            note: existing ? existing.note : "",
          });
        }
        return { ...l, coreCount: count, cores: newCores };
      })
    );
  };

  // Update a single core's properties
  const handleCoreUpdate = (lineId: string, coreNumber: number, field: "status" | "note", val: string) => {
    setLines(
      lines.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          cores: l.cores.map((c) => (c.number === coreNumber ? { ...c, [field]: val } : c)),
        };
      })
    );
  };

  // Browser Geolocation Grab
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewBoxLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setIsGettingLocation(false);
      },
      () => {
        setIsGettingLocation(false);
        alert("Unable to retrieve GPS coordinates. Please ensure location permission is allowed.");
      }
    );
  };

  // Save Box Submission
  const handleSaveBox = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoxName) return;

    const createdBox: TJBox = {
      id: `box_${Date.now()}`,
      name: newBoxName,
      zone: newBoxZone,
      category: newBoxCategory,
      lines: lines,
      notes: newBoxNotes,
      location: newBoxLocation,
      created_at: "Just now",
    };

    setBoxes([createdBox, ...boxes]);
    setIsBoxModalOpen(false);

    // Reset Form
    setNewBoxName("");
    setLines([
      {
        id: "line_1",
        coreCount: 2,
        direction: "In",
        brand: "",
        code: "",
        cores: [
          { number: 1, status: "Free", colorName: "Blue", note: "" },
          { number: 2, status: "Free", colorName: "Orange", note: "" },
        ],
      },
    ]);
  };

  // Save Zone Submission
  const handleSaveZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZone.name) return;

    const createdZone: Zone = {
      id: `zone_${Date.now()}`,
      name: newZone.name,
      code: newZone.code || `Z-${Date.now().toString().slice(-3)}`,
      description: newZone.description || "Distribution Zone",
      boxes_count: 0,
    };

    setZones([...zones, createdZone]);
    setIsZoneModalOpen(false);
    setNewZone({ name: "", code: "", description: "" });
  };

  // Filtered Boxes
  const filteredBoxes = boxes.filter((b) => {
    const matchesZone = selectedZone === "ALL" || b.zone === selectedZone;
    const matchesSearch =
      search === "" ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.zone.toLowerCase().includes(search.toLowerCase()) ||
      b.notes.toLowerCase().includes(search.toLowerCase()) ||
      b.lines.some((l) => l.code.toLowerCase().includes(search.toLowerCase()) || l.brand.toLowerCase().includes(search.toLowerCase()));
    return matchesZone && matchesSearch;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-indigo-500" />
            System & Optical Network Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage TJ distribution boxes, OLT port fiber mapping, geographic zones, and automated billing parameters.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl text-xs font-medium border border-border">
          <button
            onClick={() => setActiveTab("optical")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "optical" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            TJ Boxes & Zones
          </button>
          <button
            onClick={() => setActiveTab("billing")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "billing" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Billing & Lock Rules
          </button>
          <button
            onClick={() => setActiveTab("sms")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "sms" ? "bg-card text-foreground font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            SMS Gateway
          </button>
        </div>
      </div>

      {activeTab === "optical" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Panel: My Zones */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-indigo-500" />
                  <CardTitle className="text-sm font-bold text-foreground">My Zones</CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsZoneModalOpen(true)}
                  className="h-7 text-xs gap-1 border-border bg-background"
                >
                  <Plus className="h-3 w-3" /> Add Zone
                </Button>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0 text-xs">
                <button
                  onClick={() => setSelectedZone("ALL")}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between ${
                    selectedZone === "ALL"
                      ? "bg-indigo-600 text-white font-bold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>All Zones</span>
                  <Badge variant={selectedZone === "ALL" ? "secondary" : "outline"} className="text-[10px]">
                    {boxes.length} Boxes
                  </Badge>
                </button>

                {zones.map((zone) => {
                  const count = boxes.filter((b) => b.zone === zone.name).length;
                  return (
                    <button
                      key={zone.id}
                      onClick={() => setSelectedZone(zone.name)}
                      className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex flex-col gap-0.5 ${
                        selectedZone === zone.name
                          ? "bg-indigo-600 text-white font-bold shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">{zone.name}</span>
                        <span className="text-[10px] opacity-80">{count} Boxes</span>
                      </div>
                      <span className="text-[10px] opacity-75 truncate">{zone.description}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel: TJ Boxes / Ports List */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <div className="relative flex-1 max-w-md w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by Box Name, Zone, or Fiber Code..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 bg-background text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMapModalOpen(true)}
                      className="h-9 gap-1.5 border-border bg-background text-xs font-semibold text-foreground"
                    >
                      <Map className="h-4 w-4 text-indigo-500" />
                      View Map
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsBoxModalOpen(true)}
                      className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20"
                    >
                      <Plus className="h-4 w-4" />
                      Add Box
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {filteredBoxes.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-xs space-y-2">
                    <Radio className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="font-semibold text-foreground">No TJ Boxes or OLT Ports added yet.</p>
                    <p>Click &quot;+ Add Box&quot; to configure your first optical terminal box.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredBoxes.map((box) => {
                      const totalCores = box.lines.reduce((acc, l) => acc + l.cores.length, 0);
                      const usedCores = box.lines.reduce((acc, l) => acc + l.cores.filter((c) => c.status === "Used").length, 0);
                      const freeCores = box.lines.reduce((acc, l) => acc + l.cores.filter((c) => c.status === "Free").length, 0);

                      return (
                        <div key={box.id} className="p-4 hover:bg-muted/30 transition-colors space-y-3 text-xs">
                          {/* Top Row: Box Title & Badges */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 font-bold">
                                <Network className="h-4 w-4" />
                              </div>
                              <div>
                                <h3 className="font-bold text-sm text-foreground">{box.name}</h3>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3 text-indigo-500" />
                                  <span>{box.zone}</span>
                                  <span>•</span>
                                  <span className="font-mono text-muted-foreground">{box.location}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-semibold bg-background">
                                {box.category}
                              </Badge>
                              <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white">
                                {usedCores}/{totalCores} Cores Active ({freeCores} Free)
                              </Badge>
                            </div>
                          </div>

                          {/* Notes / Subzones */}
                          {box.notes && (
                            <p className="text-[11px] text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md">
                              <span className="font-semibold text-foreground">Coverage Subzones:</span> {box.notes}
                            </p>
                          )}

                          {/* Fiber Lines & Cores Visualizer */}
                          <div className="space-y-2 pt-1">
                            {box.lines.map((line, lIdx) => (
                              <div key={line.id || lIdx} className="p-2.5 rounded-lg border border-border/80 bg-background space-y-2">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span className="font-semibold text-foreground">
                                    Line {lIdx + 1}: {line.coreCount} Core ({line.direction}) {line.brand ? `· ${line.brand}` : ""} {line.code ? `[${line.code}]` : ""}
                                  </span>
                                  <span className="text-[10px]">{line.cores.filter((c) => c.status === "Used").length} Connected</span>
                                </div>

                                {/* Core chips */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {line.cores.map((core) => {
                                    const colorDef = FIBER_CORE_COLORS.find((c) => c.name === core.colorName) || FIBER_CORE_COLORS[0];
                                    return (
                                      <div
                                        key={core.number}
                                        title={`Core ${core.number} (${core.colorName}): ${core.status} ${core.note ? `- ${core.note}` : ""}`}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium transition-all ${
                                          core.status === "Used"
                                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-500"
                                            : core.status === "Damaged"
                                            ? "bg-red-500/10 border-red-500/30 text-red-500"
                                            : "bg-muted border-border text-muted-foreground"
                                        }`}
                                      >
                                        <span className={`h-2.5 w-2.5 rounded-full ${colorDef.bg} ${colorDef.border} border shrink-0`} />
                                        <span>#{core.number}</span>
                                        <span className="font-semibold">[{core.status}]</span>
                                        {core.note && <span className="max-w-[90px] truncate text-muted-foreground">({core.note})</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab: Billing & Lock Rules */}
      {activeTab === "billing" && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-500" />
              Automated Billing & Lock Intervals
            </CardTitle>
            <CardDescription className="text-xs">Rules for automatic PPPoE disablement upon bill expiration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs max-w-xl">
            <div>
              <label className="block font-medium text-foreground mb-1">Grace Period Days</label>
              <Input defaultValue="3" placeholder="Days after due date before auto-lock" />
              <p className="text-[11px] text-muted-foreground mt-1">Number of days a client remains active after expiry date.</p>
            </div>
            <div>
              <label className="block font-medium text-foreground mb-1">Daily Automated Sync Time</label>
              <Input defaultValue="00:05 AM" />
            </div>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Save className="h-4 w-4" /> Save Billing Rules
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tab: SMS Gateway */}
      {activeTab === "sms" && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-500" />
              SMS & Alert Gateway
            </CardTitle>
            <CardDescription className="text-xs">Provider credentials for automated invoice and recharge SMS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs max-w-xl">
            <div>
              <label className="block font-medium text-foreground mb-1">SMS Provider</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground">
                <option>Greenweb Bangladesh API</option>
                <option>Onnorokom SMS Gateway</option>
                <option>BulkSMS BD HTTP API</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-foreground mb-1">API Key / Token</label>
              <Input type="password" defaultValue="gw_live_98a76d54f32e10" />
            </div>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Save className="h-4 w-4" /> Save Gateway Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: Add TJ Box / OLT Port (Exact match to User Screenshot) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {isBoxModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8 text-xs max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-foreground">Add TJ Box / OLT Port</h2>
              <button
                type="button"
                onClick={() => setIsBoxModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBox} className="space-y-4">
              {/* Box Name / ID */}
              <div>
                <label className="block text-foreground font-semibold mb-1">Box Name / ID</label>
                <Input
                  required
                  placeholder="e.g. BOX-A1"
                  value={newBoxName}
                  onChange={(e) => setNewBoxName(e.target.value)}
                  className="bg-background"
                />
              </div>

              {/* Select Zone */}
              <div>
                <label className="block text-foreground font-semibold mb-1">Select Zone</label>
                <select
                  required
                  value={newBoxZone}
                  onChange={(e) => setNewBoxZone(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">-- Select Zone --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.name}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Box Category */}
              <div>
                <label className="block text-foreground font-semibold mb-1">Box Category</label>
                <select
                  value={newBoxCategory}
                  onChange={(e) => setNewBoxCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option>Master Box</option>
                  <option>Sub Box</option>
                  <option>Splitter Box (1:8 / 1:16)</option>
                  <option>Distribution TJ Box</option>
                  <option>OLT Port Terminal</option>
                </select>
              </div>

              {/* Fiber Lines */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-foreground font-semibold">Fiber Lines</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddLine}
                    className="h-7 text-xs gap-1 border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600/10 font-medium"
                  >
                    <Plus className="h-3 w-3" /> Add Line
                  </Button>
                </div>

                {lines.map((line, idx) => (
                  <div key={line.id} className="p-3 rounded-lg border border-border bg-muted/20 space-y-3">
                    {/* Line Controls Header */}
                    <div className="flex items-center gap-2">
                      <select
                        value={line.coreCount}
                        onChange={(e) => handleLineCoreCountChange(line.id, parseInt(e.target.value))}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground font-medium"
                      >
                        <option value={2}>2 Core</option>
                        <option value={4}>4 Core</option>
                        <option value={6}>6 Core</option>
                        <option value={8}>8 Core</option>
                        <option value={12}>12 Core</option>
                        <option value={24}>24 Core</option>
                      </select>

                      <select
                        value={line.direction}
                        onChange={(e) =>
                          setLines(lines.map((l) => (l.id === line.id ? { ...l, direction: e.target.value as any } : l)))
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                      >
                        <option value="In">In</option>
                        <option value="Out">Out</option>
                      </select>

                      <Input
                        placeholder="Brand"
                        value={line.brand}
                        onChange={(e) =>
                          setLines(lines.map((l) => (l.id === line.id ? { ...l, brand: e.target.value } : l)))
                        }
                        className="h-8 flex-1 bg-background"
                      />

                      <Input
                        placeholder="Code"
                        value={line.code}
                        onChange={(e) =>
                          setLines(lines.map((l) => (l.id === line.id ? { ...l, code: e.target.value } : l)))
                        }
                        className="h-8 flex-1 bg-background"
                      />

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Cores Configuration Panel */}
                    <div className="space-y-2 bg-background p-2.5 rounded-md border border-border">
                      <p className="text-[11px] font-semibold text-foreground">Cores Configuration:</p>
                      <div className="space-y-2">
                        {line.cores.map((core) => {
                          const colorDef = FIBER_CORE_COLORS.find((c) => c.name === core.colorName) || FIBER_CORE_COLORS[0];
                          return (
                            <div key={core.number} className="flex items-center gap-2">
                              <span className="w-12 text-muted-foreground font-medium">{core.number}:</span>

                              <select
                                value={core.status}
                                onChange={(e) => handleCoreUpdate(line.id, core.number, "status", e.target.value)}
                                className="h-7 rounded border border-input bg-card px-2 text-[11px] text-foreground"
                              >
                                <option value="Free">Free</option>
                                <option value="Used">Used</option>
                                <option value="Damaged">Damaged</option>
                                <option value="Reserved">Reserved</option>
                              </select>

                              <span className={`h-3 w-3 rounded-full ${colorDef.bg} ${colorDef.border} border shrink-0`} />

                              <Input
                                placeholder="Note"
                                value={core.note}
                                onChange={(e) => handleCoreUpdate(line.id, core.number, "note", e.target.value)}
                                className="h-7 text-[11px] flex-1 bg-card"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Notes (e.g. sub-zone names separated by comma) */}
              <div>
                <label className="block text-foreground font-semibold mb-1">
                  Notes (e.g. sub-zone names separated by comma)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. SubZone-1, SubZone-2"
                  value={newBoxNotes}
                  onChange={(e) => setNewBoxNotes(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Location (Lat, Long) with Get Button */}
              <div>
                <label className="block text-foreground font-semibold mb-1">Location (Lat, Long)</label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="23.1234, 90.1234"
                    value={newBoxLocation}
                    onChange={(e) => setNewBoxLocation(e.target.value)}
                    className="bg-background flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGetLocation}
                    disabled={isGettingLocation}
                    className="h-9 gap-1 text-xs border-border bg-background"
                  >
                    <Compass className={`h-3.5 w-3.5 text-indigo-500 ${isGettingLocation ? 'animate-spin' : ''}`} />
                    Get
                  </Button>
                </div>
              </div>

              {/* Save Box Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 shadow-md shadow-indigo-600/20"
                >
                  Save Box
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: Add Zone */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Add New Geographic Zone</h3>
              <button
                type="button"
                onClick={() => setIsZoneModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveZone} className="space-y-3">
              <div>
                <label className="block text-foreground font-semibold mb-1">Zone Name *</label>
                <Input
                  required
                  placeholder="e.g. Zone 4 - Gulshan North"
                  value={newZone.name}
                  onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                  className="bg-background"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Zone Code</label>
                <Input
                  placeholder="e.g. Z-GLS-04"
                  value={newZone.code}
                  onChange={(e) => setNewZone({ ...newZone, code: e.target.value })}
                  className="bg-background"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Description / Area Boundary</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Optical distribution loop for Gulshan Avenue & Circle 2"
                  value={newZone.description}
                  onChange={(e) => setNewZone({ ...newZone, description: e.target.value })}
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsZoneModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  Create Zone
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: View Map (GIS Optical Fiber Pins) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {isMapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Map className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-bold text-foreground">Geographic Fiber & TJ Box Topology Map</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMapModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="h-[360px] w-full rounded-lg bg-muted/40 border border-border relative overflow-hidden flex items-center justify-center">
              {/* Simulated GIS Interactive Map Canvas */}
              <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]" />
              
              <div className="space-y-4 text-center z-10 p-6">
                <Compass className="h-10 w-10 mx-auto text-indigo-500 animate-pulse" />
                <div>
                  <p className="font-bold text-sm text-foreground">GIS Coordinates Active</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {boxes.length} TJ Box & OLT Port markers plotted across {zones.length} active coverage zones.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-left">
                  {boxes.map((b) => (
                    <div key={b.id} className="p-2.5 rounded-md bg-card border border-border shadow-xs">
                      <p className="font-bold text-foreground flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-red-500" /> {b.name}
                      </p>
                      <p className="text-[10px] font-mono text-indigo-500 mt-0.5">{b.location}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setIsMapModalOpen(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Close Map View
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
