"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings,
  MapPin,
  Plus,
  Search,
  Map,
  Trash2,
  Radio,
  Network,
  Server,
  Layers,
  CheckCircle2,
  X,
  Cpu,
  Shield,
  Bell,
  Save,
  Navigation,
  Send,
  AlertCircle,
  Building2,
  RefreshCw,
  Clock,
  Sparkles,
  Smartphone,
  CreditCard,
  Edit,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";
import { SettingsClient } from "@/lib/settings/settings-api";
import { CompanySetting, SmsProviderEnum } from "@/lib/settings/settings-types";
import { ApiClient } from "@/lib/api";

const FiberNetworkMapModal = dynamic(
  () => import("@/components/network/FiberNetworkMapModal"),
  { ssr: false }
);

// Standard Optical Fiber Core Colors & Emojis matching legacy ShebaFi configuration
interface CoreColorDef {
  name: string;
  label: string;
  emoji: string;
  hex: string;
  bg: string;
  border: string;
}

const FIBER_CORE_COLORS: CoreColorDef[] = [
  { name: "blue", label: "Blue", emoji: "🔵", hex: "#1E90FF", bg: "bg-blue-500", border: "border-blue-600" },
  { name: "orange", label: "Orange", emoji: "🟠", hex: "#FFA500", bg: "bg-orange-500", border: "border-orange-600" },
  { name: "green", label: "Green", emoji: "🟢", hex: "#32CD32", bg: "bg-emerald-500", border: "border-emerald-600" },
  { name: "brown", label: "Brown", emoji: "🟤", hex: "#8B4513", bg: "bg-amber-800", border: "border-amber-900" },
  { name: "slate", label: "Slate", emoji: "🔘", hex: "#708090", bg: "bg-slate-400", border: "border-slate-500" },
  { name: "white", label: "White", emoji: "⚪", hex: "#D3D3D3", bg: "bg-slate-100", border: "border-slate-300" },
  { name: "red", label: "Red", emoji: "🔴", hex: "#FF0000", bg: "bg-red-500", border: "border-red-600" },
  { name: "black", label: "Black", emoji: "⚫", hex: "#000000", bg: "bg-slate-900", border: "border-slate-700" },
  { name: "yellow", label: "Yellow", emoji: "🟡", hex: "#D4AF37", bg: "bg-yellow-400", border: "border-yellow-500" },
  { name: "violet", label: "Violet", emoji: "🟣", hex: "#8A2BE2", bg: "bg-purple-500", border: "border-purple-600" },
  { name: "rose", label: "Rose", emoji: "🌸", hex: "#FF69B4", bg: "bg-pink-400", border: "border-pink-500" },
  { name: "aqua", label: "Aqua", emoji: "💧", hex: "#00CED1", bg: "bg-cyan-400", border: "border-cyan-500" },
];

interface CoreConfig {
  number: number;
  status: "free" | "used" | "damaged" | "reserved";
  colorName: string;
  note: string;
}

interface FiberLine {
  id: string;
  category: string; // "2core" | "4core" | "6core" | "8core" | "12core" | "24core" | "48core"
  in_out: "In" | "Out";
  brand: string;
  code: string;
  cores: CoreConfig[];
  isExpanded?: boolean;
}

interface TJBox {
  id: string;
  name: string;
  zone_id?: string | null;
  zone: string;
  category: "Master Box" | "Splitter Box" | "Zone/point Box";
  lines: FiberLine[];
  notes: string;
  location: string;
  created_at: string;
}

interface POPZone {
  id: string;
  name: string;
  code: string;
  location?: string;
  boxes_count?: number;
  description?: string;
}

// Haversine distance calculator for optical fiber spans
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function parseFiberLines(raw: unknown): FiberLine[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Plain text fallback
      return raw
        .split("\n")
        .map((line, idx) => line.trim())
        .filter(Boolean)
        .map((line, idx) => ({
          id: `line_${idx}`,
          category: "2core",
          in_out: "In",
          brand: "",
          code: line,
          cores: [
            { number: 1, status: "free", colorName: "blue", note: "" },
            { number: 2, status: "free", colorName: "orange", note: "" },
          ],
        }));
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.map((item: any, idx: number) => {
    const category = item.category || "2core";
    const coreCount = parseInt(category) || 2;
    const existingCores = Array.isArray(item.cores) ? item.cores : [];
    const cores: CoreConfig[] = [];

    for (let i = 1; i <= coreCount; i++) {
      const existing = existingCores[i - 1] || {};
      const statusRaw = (existing.status || "free").toString().toLowerCase();
      const status =
        statusRaw === "used" ? "used" : statusRaw === "damaged" ? "damaged" : statusRaw === "reserved" ? "reserved" : "free";
      const colorDef = FIBER_CORE_COLORS[(i - 1) % 12];
      const colorName = existing.color || existing.colorName || colorDef.name;
      const note = existing.note || "";
      cores.push({
        number: i,
        status,
        colorName,
        note,
      });
    }

    return {
      id: item.id || `line_${idx}_${Date.now()}`,
      category,
      in_out: item.in_out === "Out" ? "Out" : "In",
      brand: item.brand || "",
      code: item.code || "",
      cores,
      isExpanded: true,
    };
  });
}

function buildFiberLinesPayload(lines: FiberLine[]) {
  return lines.map((l) => ({
    category: l.category,
    in_out: l.in_out,
    brand: l.brand,
    code: l.code,
    cores: l.cores.map((c) => ({
      status: c.status,
      color: c.colorName,
      note: c.note,
    })),
  }));
}

export default function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState<"optical" | "billing" | "sms" | "profile" | "network">("optical");

  // Backend Settings State
  const [settings, setSettings] = useState<CompanySetting | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Optical / POP Zones State
  const [zones, setZones] = useState<POPZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [boxes, setBoxes] = useState<TJBox[]>([]);
  const [isLoadingBoxes, setIsLoadingBoxes] = useState(true);
  const [search, setSearch] = useState("");

  // Modals
  const [isBoxModalOpen, setIsBoxModalOpen] = useState(false);
  const [isEditBoxModalOpen, setIsEditBoxModalOpen] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isTestSmsModalOpen, setIsTestSmsModalOpen] = useState(false);

  // New Zone Form
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneCode, setNewZoneCode] = useState("");
  const [newZoneLocation, setNewZoneLocation] = useState("");
  const [isSubmittingZone, setIsSubmittingZone] = useState(false);

  // Add TJ Box Form
  const [newBoxName, setNewBoxName] = useState("");
  const [newBoxZone, setNewBoxZone] = useState("");
  const [newBoxCategory, setNewBoxCategory] = useState<"Master Box" | "Splitter Box" | "Zone/point Box">("Master Box");
  const [newBoxLocation, setNewBoxLocation] = useState("");
  const [newBoxNotes, setNewBoxNotes] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSubmittingBox, setIsSubmittingBox] = useState(false);
  const [lines, setLines] = useState<FiberLine[]>([
    {
      id: "line_init_1",
      category: "4core",
      in_out: "In",
      brand: "FiberHome",
      code: "F-MAIN-01",
      cores: [
        { number: 1, status: "used", colorName: "blue", note: "OLT Port 1/1 Feed" },
        { number: 2, status: "used", colorName: "orange", note: "OLT Port 1/2 Feed" },
        { number: 3, status: "free", colorName: "green", note: "Standby" },
        { number: 4, status: "free", colorName: "brown", note: "Standby" },
      ],
      isExpanded: true,
    },
  ]);

  // Edit TJ Box Form
  const [editingBox, setEditingBox] = useState<TJBox | null>(null);
  const [editBoxName, setEditBoxName] = useState("");
  const [editBoxZone, setEditBoxZone] = useState("");
  const [editBoxCategory, setEditBoxCategory] = useState<"Master Box" | "Splitter Box" | "Zone/point Box">("Master Box");
  const [editBoxLocation, setEditBoxLocation] = useState("");
  const [editBoxNotes, setEditBoxNotes] = useState("");
  const [editLines, setEditLines] = useState<FiberLine[]>([]);
  const [isUpdatingBox, setIsUpdatingBox] = useState(false);

  // SMS Test Modal Form
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("ShebaFi ISP test alert: Your optical broadband service is active!");
  const [isSendingTestSms, setIsSendingTestSms] = useState(false);
  const [testSmsStatus, setTestSmsStatus] = useState<string | null>(null);

  // ════════════════════════ DATA LOADERS ════════════════════════

  const fetchSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    setErrorMessage(null);
    try {
      const data = await SettingsClient.getSettings();
      setSettings(data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load company settings.");
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  const fetchZonesAndBoxes = useCallback(async () => {
    setIsLoadingBoxes(true);
    try {
      // 1. Fetch POP Branches
      const branchesData = await ApiClient.getBranches();
      const branchList = Array.isArray(branchesData) ? branchesData : [];
      const mappedZones: POPZone[] = branchList.map((b: any) => ({
        id: b.id,
        name: b.name,
        code: b.code || "",
        location: b.location || "",
        boxes_count: 0,
      }));
      setZones(mappedZones);
      if (mappedZones.length > 0) {
        setNewBoxZone((prev) => prev || mappedZones[0].name);
      }

      // 2. Fetch TJ Boxes from backend
      const tjBoxesData = await ApiClient.getTJBoxes();
      const rawBoxes = Array.isArray(tjBoxesData) ? tjBoxesData : [];

      const parsedBoxes: TJBox[] = rawBoxes.map((b: any) => ({
        id: b.id,
        name: b.name,
        zone_id: b.zone,
        zone: b.zone_name || (mappedZones.find((z) => z.id === b.zone)?.name ?? "Unassigned Zone"),
        category: (b.box_category as any) || "Master Box",
        lines: parseFiberLines(b.fiber_code),
        notes: b.notes || "",
        location: b.lat_long || (b.latitude && b.longitude ? `${b.latitude}, ${b.longitude}` : ""),
        created_at: b.created_at ? new Date(b.created_at).toLocaleDateString() : "Just now",
      }));
      setBoxes(parsedBoxes);
    } catch (err: unknown) {
      setBoxes([]);
      setErrorMessage(err instanceof Error ? err.message : "Failed to load optical zones and TJ boxes.");
    } finally {
      setIsLoadingBoxes(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchZonesAndBoxes();
  }, [fetchSettings, fetchZonesAndBoxes]);

  // ════════════════════════ ACTIONS & HANDLERS ════════════════════════

  const handleSaveSettings = async (patch: Partial<CompanySetting>) => {
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const updated = await SettingsClient.updateCurrentSettings(patch);
      setSettings(updated);
      setSuccessMessage("Settings saved successfully and persisted to backend.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGetLocation = (target: "add" | "edit") => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        if (target === "add") setNewBoxLocation(coords);
        else setEditBoxLocation(coords);
        setIsGettingLocation(false);
      },
      () => {
        setIsGettingLocation(false);
        alert("Unable to retrieve GPS coordinates. Please verify browser permissions.");
      }
    );
  };

  // Line helpers for Add Form
  const handleAddLine = (target: "add" | "edit") => {
    const newLine: FiberLine = {
      id: `line_${Date.now()}`,
      category: "2core",
      in_out: "In",
      brand: "",
      code: "",
      cores: [
        { number: 1, status: "free", colorName: "blue", note: "" },
        { number: 2, status: "free", colorName: "orange", note: "" },
      ],
      isExpanded: true,
    };
    if (target === "add") setLines([...lines, newLine]);
    else setEditLines([...editLines, newLine]);
  };

  const handleRemoveLine = (target: "add" | "edit", lineId: string) => {
    if (target === "add") setLines(lines.filter((l) => l.id !== lineId));
    else setEditLines(editLines.filter((l) => l.id !== lineId));
  };

  const handleLineCategoryChange = (target: "add" | "edit", lineId: string, category: string) => {
    const coreCount = parseInt(category) || 2;
    const updateFn = (currentLines: FiberLine[]) =>
      currentLines.map((line) => {
        if (line.id !== lineId) return line;
        const currentCores = line.cores || [];
        const newCores: CoreConfig[] = [];
        for (let i = 1; i <= coreCount; i++) {
          const existing = currentCores[i - 1];
          const colorDef = FIBER_CORE_COLORS[(i - 1) % 12];
          newCores.push(
            existing || {
              number: i,
              status: "free",
              colorName: colorDef.name,
              note: "",
            }
          );
        }
        return { ...line, category, cores: newCores };
      });

    if (target === "add") setLines(updateFn(lines));
    else setEditLines(updateFn(editLines));
  };

  const handleSaveBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoxName.trim()) return;

    setIsSubmittingBox(true);
    try {
      const selectedZoneObj = zones.find((z) => z.name === newBoxZone);
      const payload = {
        name: newBoxName.trim(),
        zone: selectedZoneObj?.id || null,
        box_category: newBoxCategory,
        lat_long: newBoxLocation.trim(),
        notes: newBoxNotes.trim(),
        fiber_code: buildFiberLinesPayload(lines),
      };

      const res = await ApiClient.createTJBox(payload);

      const createdBox: TJBox = {
        id: res.id || `box_${Date.now()}`,
        name: res.name || newBoxName,
        zone_id: res.zone || selectedZoneObj?.id || null,
        zone: res.zone_name || newBoxZone || (zones[0]?.name ?? "General Zone"),
        category: (res.box_category as any) || newBoxCategory,
        lines: parseFiberLines(res.fiber_code || lines),
        notes: res.notes || newBoxNotes,
        location: res.lat_long || newBoxLocation,
        created_at: res.created_at ? new Date(res.created_at).toLocaleDateString() : "Just now",
      };

      setBoxes([createdBox, ...boxes]);
      setIsBoxModalOpen(false);

      // Reset form
      setNewBoxName("");
      setNewBoxNotes("");
      setNewBoxLocation("");
      setLines([
        {
          id: `line_${Date.now()}`,
          category: "2core",
          in_out: "In",
          brand: "",
          code: "",
          cores: [
            { number: 1, status: "free", colorName: "blue", note: "" },
            { number: 2, status: "free", colorName: "orange", note: "" },
          ],
          isExpanded: true,
        },
      ]);
      setSuccessMessage(`TJ Box "${createdBox.name}" saved to database successfully!`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create TJ Box on backend.");
    } finally {
      setIsSubmittingBox(false);
    }
  };

  const openEditModal = (box: TJBox) => {
    setEditingBox(box);
    setEditBoxName(box.name);
    setEditBoxZone(box.zone);
    setEditBoxCategory(box.category);
    setEditBoxLocation(box.location);
    setEditBoxNotes(box.notes);
    setEditLines(
      box.lines.map((l) => ({
        ...l,
        cores: l.cores.map((c) => ({ ...c })),
        isExpanded: true,
      }))
    );
    setIsEditBoxModalOpen(true);
  };

  const handleUpdateBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBox || !editBoxName.trim()) return;

    setIsUpdatingBox(true);
    try {
      const selectedZoneObj = zones.find((z) => z.name === editBoxZone);
      const payload = {
        name: editBoxName.trim(),
        zone: selectedZoneObj?.id || null,
        box_category: editBoxCategory,
        lat_long: editBoxLocation.trim(),
        notes: editBoxNotes.trim(),
        fiber_code: buildFiberLinesPayload(editLines),
      };

      const res = await ApiClient.updateTJBox(editingBox.id, payload);

      const updatedBox: TJBox = {
        ...editingBox,
        name: res.name || editBoxName,
        zone_id: res.zone || selectedZoneObj?.id || null,
        zone: res.zone_name || editBoxZone,
        category: (res.box_category as any) || editBoxCategory,
        lines: parseFiberLines(res.fiber_code || editLines),
        notes: res.notes || editBoxNotes,
        location: res.lat_long || editBoxLocation,
      };

      setBoxes(boxes.map((b) => (b.id === editingBox.id ? updatedBox : b)));
      setIsEditBoxModalOpen(false);
      setSuccessMessage(`TJ Box "${updatedBox.name}" updated successfully!`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update TJ Box on backend.");
    } finally {
      setIsUpdatingBox(false);
    }
  };

  const handleDeleteBox = async (box: TJBox) => {
    if (!confirm(`Are you sure you want to delete TJ Box "${box.name}"?`)) return;
    try {
      await ApiClient.deleteTJBox(box.id);
      setBoxes(boxes.filter((b) => b.id !== box.id));
      setSuccessMessage(`TJ Box "${box.name}" deleted successfully.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete TJ Box.");
    }
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;

    setIsSubmittingZone(true);
    try {
      const created = await ApiClient.createBranch({
        name: newZoneName.trim(),
        code: newZoneCode.trim() || `Z-${newZoneName.slice(0, 3).toUpperCase()}`,
        location: newZoneLocation.trim() || "Distribution Ring",
      });

      const nextZone: POPZone = {
        id: created.id || `zone_${Date.now()}`,
        name: created.name || newZoneName,
        code: created.code || newZoneCode,
        location: created.location || newZoneLocation,
        boxes_count: 0,
      };
      setZones([...zones, nextZone]);
      setIsZoneModalOpen(false);
      setNewZoneName("");
      setNewZoneCode("");
      setNewZoneLocation("");
      setSuccessMessage(`Zone / POP "${nextZone.name}" created successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create zone on backend.");
    } finally {
      setIsSubmittingZone(false);
    }
  };

  const handleDeleteZone = async (zone: POPZone) => {
    if (!confirm(`Are you sure you want to delete Zone "${zone.name}"?`)) return;
    try {
      await ApiClient.deleteBranch(zone.id);
      setZones(zones.filter((z) => z.id !== zone.id));
      if (selectedZone === zone.name) setSelectedZone("ALL");
      setSuccessMessage(`Zone "${zone.name}" deleted successfully.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete zone.");
    }
  };

  const handleSendTestSms = async () => {
    setIsSendingTestSms(true);
    setTestSmsStatus(null);
    try {
      const res = await SettingsClient.testSmsGateway(
        {
          sms_provider: settings?.sms_provider || "Custom URL Gateway",
          sms_sender_id: settings?.sms_sender_id || "SHEBAFI",
          sms_api_key: settings?.sms_api_key || "",
          sms_gateway_url: settings?.sms_gateway_url || "",
        },
        testPhone,
        testMessage
      );
      setTestSmsStatus(res.message || "Test SMS simulated successfully.");
    } catch (err: unknown) {
      setTestSmsStatus(err instanceof Error ? err.message : "Test SMS failed.");
    } finally {
      setIsSendingTestSms(false);
    }
  };

  // Filtered Boxes
  const filteredBoxes = boxes.filter((b) => {
    const matchesZone = selectedZone === "ALL" || b.zone === selectedZone;
    const matchesSearch =
      search === "" ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.zone.toLowerCase().includes(search.toLowerCase()) ||
      b.notes.toLowerCase().includes(search.toLowerCase()) ||
      b.lines.some(
        (l) =>
          l.code.toLowerCase().includes(search.toLowerCase()) ||
          l.brand.toLowerCase().includes(search.toLowerCase())
      );
    return matchesZone && matchesSearch;
  });

  return (
    <div className="p-4 lg:p-6 space-y-6 pb-12 max-w-[1600px] mx-auto text-xs">
      {/* ════════════════════════ TOP HEADER ════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Settings className="h-6 w-6 text-indigo-500" />
              ISP Administrator Configuration
            </h1>
            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-semibold">
              Authoritative Cockpit
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configure optical distribution zones, TJ boxes & fiber cores, billing & auto-lock policies, SMS gateways, and MikroTik network defaults.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchSettings();
              fetchZonesAndBoxes();
            }}
            disabled={isLoadingSettings || isLoadingBoxes}
            className="h-8 gap-1.5 border-border bg-card text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSettings || isLoadingBoxes ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {successMessage && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ════════════════════════ TAB CONTROLS ════════════════════════ */}
      <div className="flex border-b border-border gap-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab("optical")}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "optical"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Network className="h-4 w-4" />
          Optical TJ Boxes & Zones
        </button>

        <button
          onClick={() => setActiveTab("billing")}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "billing"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Shield className="h-4 w-4" />
          Billing & Auto-Lock Rules
        </button>

        <button
          onClick={() => setActiveTab("sms")}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "sms"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bell className="h-4 w-4" />
          SMS Gateway & Alerts
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "profile"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Company & Invoicing Defaults
        </button>

        <button
          onClick={() => setActiveTab("network")}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "network"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Server className="h-4 w-4" />
          Network Defaults
        </button>
      </div>

      {/* ════════════════════════ TAB: OPTICAL NETWORK & ZONES ════════════════════════ */}
      {activeTab === "optical" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Zones Panel */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-indigo-500" />
                  <CardTitle className="text-sm font-bold text-foreground">My Zones</CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsZoneModalOpen(true)}
                  className="h-7 text-xs gap-1 border-border bg-background cursor-pointer"
                >
                  <Plus className="h-3 w-3" /> Add Zone
                </Button>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0 text-xs">
                <button
                  onClick={() => setSelectedZone("ALL")}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
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

                {zones.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground text-[11px]">No zones configured yet.</p>
                ) : (
                  zones.map((zone) => {
                    const count = boxes.filter((b) => b.zone === zone.name || b.zone_id === zone.id).length;
                    const isSelected = selectedZone === zone.name;
                    return (
                      <div
                        key={zone.id}
                        className={`group rounded-lg transition-colors flex items-center justify-between pr-2 ${
                          isSelected ? "bg-indigo-600 text-white font-bold" : "hover:bg-muted/60 text-muted-foreground"
                        }`}
                      >
                        <button
                          onClick={() => setSelectedZone(zone.name)}
                          className="w-full text-left px-3 py-2 flex flex-col gap-0.5 cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="truncate font-semibold">{zone.name}</span>
                            <span className="text-[10px] opacity-80">{count} Boxes</span>
                          </div>
                          <span className="text-[10px] opacity-75 truncate">{zone.location || zone.code}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteZone(zone);
                          }}
                          className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:text-rose-500 cursor-pointer ${
                            isSelected ? "text-white/80 hover:text-white" : "text-muted-foreground"
                          }`}
                          title={`Delete Zone "${zone.name}"`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: TJ Boxes List */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <div className="relative flex-1 max-w-md w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by Name, Zone, or Fiber Code..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 bg-background text-xs h-8"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMapModalOpen(true)}
                      className="h-8 gap-1.5 border-border bg-background text-xs font-semibold text-foreground cursor-pointer"
                    >
                      <Map className="h-3.5 w-3.5 text-indigo-500" />
                      View Map
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsBoxModalOpen(true)}
                      className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Box
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {isLoadingBoxes ? (
                  <div className="py-16 text-center text-xs text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    Loading TJ Boxes from database...
                  </div>
                ) : filteredBoxes.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-xs space-y-2">
                    <Radio className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="font-semibold text-foreground">No TJ Boxes found.</p>
                    <p>Click &quot;+ Add Box&quot; to configure your first optical terminal joint box.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredBoxes.map((box) => {
                      const totalCores = box.lines.reduce((acc, l) => acc + l.cores.length, 0);
                      const usedCores = box.lines.reduce(
                        (acc, l) => acc + l.cores.filter((c) => c.status === "used").length,
                        0
                      );
                      const freeCores = box.lines.reduce(
                        (acc, l) => acc + l.cores.filter((c) => c.status === "free").length,
                        0
                      );

                      return (
                        <div key={box.id} className="p-4 hover:bg-muted/30 transition-colors space-y-3 text-xs">
                          {/* Top Row: Box Title, Category & Actions */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/20">
                                <Network className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-sm text-foreground">{box.name}</h3>
                                  <Badge variant="outline" className="text-[10px] font-medium bg-muted/50 border-border">
                                    {box.category}
                                  </Badge>
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-indigo-500" />
                                    {box.zone}
                                  </span>
                                  {box.location && (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono text-[10px]">{box.location}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {/* View on Google Maps Link Button */}
                              {box.location && (
                                <a
                                  href={`https://www.google.com/maps?q=${encodeURIComponent(box.location)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-7 w-7 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-indigo-500 hover:border-indigo-500/30 transition-colors cursor-pointer"
                                  title="Open in Google Maps"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}

                              {/* Edit Box Button */}
                              <button
                                type="button"
                                onClick={() => openEditModal(box)}
                                className="h-7 w-7 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-indigo-600 hover:border-indigo-500/30 transition-colors cursor-pointer"
                                title="Edit TJ Box"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>

                              {/* Delete Box Button */}
                              <button
                                type="button"
                                onClick={() => handleDeleteBox(box)}
                                className="h-7 w-7 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:border-rose-500/30 transition-colors cursor-pointer"
                                title="Delete TJ Box"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>

                              <Badge
                                variant="default"
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium ml-1"
                              >
                                {usedCores}/{totalCores} Active ({freeCores} Free)
                              </Badge>
                            </div>
                          </div>

                          {/* Notes / Subzones */}
                          {box.notes && (
                            <p className="text-[11px] text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span>{box.notes}</span>
                            </p>
                          )}

                          {/* Fiber Code Badges (Matching legacy parse_fiber_codes_structured) */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {box.lines.map((line, lIdx) => {
                              const firstCore = line.cores[0];
                              const colorDef =
                                FIBER_CORE_COLORS.find((c) => c.name === firstCore?.colorName) || FIBER_CORE_COLORS[0];
                              const usedCount = line.cores.filter((c) => c.status === "used").length;
                              const freeCount = line.cores.filter((c) => c.status === "free").length;
                              const catPretty = line.category.replace("core", " Core");
                              const brandCode = [line.brand, line.code].filter(Boolean).join(" ") || `Line ${lIdx + 1}`;

                              return (
                                <div
                                  key={line.id || lIdx}
                                  className="group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background text-[11px] font-medium shadow-2xs hover:border-indigo-500/40 cursor-help"
                                >
                                  <span>{colorDef.emoji}</span>
                                  <span className="font-semibold text-foreground">{brandCode}</span>
                                  <span className="text-muted-foreground text-[10px]">
                                    ({catPretty}, {line.in_out})
                                  </span>
                                  <span className="font-mono text-[10px] text-indigo-500">
                                    [U:{usedCount}, F:{freeCount}]
                                  </span>

                                  {/* Detailed Hover Tooltip matching legacy PHP tooltip */}
                                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-30 min-w-56 p-2 rounded-lg bg-popover border border-border shadow-xl text-[10px] space-y-1 text-popover-foreground">
                                    <p className="font-bold border-b border-border pb-1">
                                      {brandCode} — {catPretty} ({line.in_out})
                                    </p>
                                    <div className="space-y-0.5">
                                      {line.cores.map((c) => {
                                        const cColor =
                                          FIBER_CORE_COLORS.find((col) => col.name === c.colorName) ||
                                          FIBER_CORE_COLORS[0];
                                        return (
                                          <div key={c.number} className="flex items-center justify-between gap-2">
                                            <span>
                                              {cColor.emoji} Core {c.number}:{" "}
                                              <span
                                                className={c.status === "used" ? "text-rose-500 font-bold" : "text-emerald-500"}
                                              >
                                                {c.status.toUpperCase()}
                                              </span>
                                            </span>
                                            {c.note && <span className="text-muted-foreground truncate max-w-28">({c.note})</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
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

      {/* ════════════════════════ TAB: BILLING & AUTO-LOCK ════════════════════════ */}
      {activeTab === "billing" && (
        <div className="max-w-3xl space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-500" />
                Automated Billing, Grace & Expiry Policies
              </CardTitle>
              <CardDescription className="text-xs">
                Rules governing automatic PPPoE suspension, grace days, and promise balance limits across your ISP tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Grace Period (Days)</label>
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    value={settings?.grace_period_days ?? 2}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, grace_period_days: parseInt(e.target.value) || 0 } : null
                      )
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Number of days a client remains active after invoice expiry date before auto-locking.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Promise Credit Limit (Days)</label>
                  <Input
                    type="number"
                    min="1"
                    max="15"
                    value={settings?.promise_max_days ?? 5}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, promise_max_days: parseInt(e.target.value) || 1 } : null
                      )
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Maximum temporary extension days allowed when an operator grants &quot;Promise Active&quot;.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Daily Auto-Lock Execution Time</label>
                  <Input
                    value={settings?.admin_expire_time || "23:59"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, admin_expire_time: e.target.value } : null))
                    }
                    placeholder="23:59"
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Scheduled time of day (24h format) when the automated client suspension job executes.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Recharge Undo Deduct Window (Hours)</label>
                  <Input
                    type="number"
                    min="1"
                    max="48"
                    value={settings?.undo_recharge_deduct_hours ?? 2}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, undo_recharge_deduct_hours: parseInt(e.target.value) || 1 } : null
                      )
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Hours elapsed before 1-day cost is deducted when an operator undos a recharge transaction.
                  </p>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2 border-t border-border">
                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={settings?.auto_lock_on_expiry ?? true}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, auto_lock_on_expiry: e.target.checked } : null))
                    }
                    className="h-4 w-4 rounded-xs border-border text-indigo-600"
                  />
                  <div>
                    <span className="font-semibold text-foreground block">Auto-Lock PPPoE Clients upon Expiry</span>
                    <span className="text-[11px] text-muted-foreground">
                      Automatically sends MikroTik disable command when client exceeds validity and grace days.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={settings?.auto_generate_monthly_invoice ?? true}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, auto_generate_monthly_invoice: e.target.checked } : null
                      )
                    }
                    className="h-4 w-4 rounded-xs border-border text-indigo-600"
                  />
                  <div>
                    <span className="font-semibold text-foreground block">Auto-Generate Monthly Invoices</span>
                    <span className="text-[11px] text-muted-foreground">
                      Generates recurring invoices at the beginning of each billing cycle automatically.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={settings?.recharge_discount_enabled ?? true}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, recharge_discount_enabled: e.target.checked } : null
                      )
                    }
                    className="h-4 w-4 rounded-xs border-border text-indigo-600"
                  />
                  <div>
                    <span className="font-semibold text-foreground block">Enable Operator Recharge Discounts</span>
                    <span className="text-[11px] text-muted-foreground">
                      Allows billing operators to grant package discounts upon customer invoice recharge.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex justify-end pt-3">
                <Button
                  disabled={isSaving}
                  onClick={() =>
                    handleSaveSettings({
                      grace_period_days: settings?.grace_period_days,
                      promise_max_days: settings?.promise_max_days,
                      admin_expire_time: settings?.admin_expire_time,
                      undo_recharge_deduct_hours: settings?.undo_recharge_deduct_hours,
                      auto_lock_on_expiry: settings?.auto_lock_on_expiry,
                      auto_generate_monthly_invoice: settings?.auto_generate_monthly_invoice,
                      recharge_discount_enabled: settings?.recharge_discount_enabled,
                    })
                  }
                  className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving to Backend..." : "Save Billing Rules"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB: SMS GATEWAYS & ALERTS ════════════════════════ */}
      {activeTab === "sms" && (
        <div className="max-w-3xl space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Bell className="h-5 w-5 text-indigo-500" />
                  SMS Notification Gateway & Shortcodes
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure SMS HTTP webhook providers and dynamic message templates.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTestSmsModalOpen(true)}
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <Send className="h-3.5 w-3.5 text-emerald-500" />
                Send Test SMS
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.sms_enabled ?? true}
                  onChange={(e) =>
                    setSettings((prev) => (prev ? { ...prev, sms_enabled: e.target.checked } : null))
                  }
                  className="h-4 w-4 rounded-xs border-border text-indigo-600"
                />
                <div>
                  <span className="font-semibold text-foreground block">Enable Automated SMS System</span>
                  <span className="text-[11px] text-muted-foreground">
                    Master switch for automated payment notifications and expiry alerts.
                  </span>
                </div>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">SMS Provider Service</label>
                  <select
                    value={settings?.sms_provider || "Custom URL Gateway"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, sms_provider: e.target.value as SmsProviderEnum } : null))
                    }
                    className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="Custom URL Gateway">Custom HTTP Gateway (URL Template)</option>
                    <option value="Greenweb">Greenweb Bangladesh</option>
                    <option value="BulkSMSBD">BulkSMS BD API</option>
                    <option value="Onnorokom">Onnorokom SMS</option>
                    <option value="Twilio">Twilio Cloud SMS</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Sender ID / Masking</label>
                  <Input
                    value={settings?.sms_sender_id || "SHEBAFI"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, sms_sender_id: e.target.value } : null))
                    }
                    placeholder="e.g. SHEBAFI"
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-foreground text-xs">
                    HTTP Gateway URL (Supports: {"{KEY}"}, {"{SENDER}"}, {"{MSG}"}, {"{NUMBER}"})
                  </label>
                  <Input
                    value={
                      settings?.sms_gateway_url ||
                      "https://api.provider.com/send?key={KEY}&sender={SENDER}&msg={MSG}&to={NUMBER}"
                    }
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, sms_gateway_url: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-foreground text-xs">API Secret Key / Token</label>
                  <Input
                    type="password"
                    value={settings?.sms_api_key || ""}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, sms_api_key: e.target.value } : null))
                    }
                    placeholder="Enter SMS gateway authentication key..."
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Templates */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Payment Receipt Template</label>
                  <textarea
                    rows={2}
                    value={
                      settings?.payment_sms_template ||
                      "Dear [NAME], payment of [AMOUNT]৳ for ID [ID] received with thanks."
                    }
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, payment_sms_template: e.target.value } : null))
                    }
                    className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none"
                  />
                  <p className="text-[10px] text-muted-foreground">Shortcodes: [NAME], [ID], [AMOUNT], [DATE]</p>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Bill Due & Expiry Reminder Template</label>
                  <textarea
                    rows={2}
                    value={
                      settings?.expiry_reminder_template ||
                      "Dear [NAME], your internet subscription for ID [ID] will expire today. Please recharge."
                    }
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, expiry_reminder_template: e.target.value } : null))
                    }
                    className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <Button
                  disabled={isSaving}
                  onClick={() =>
                    handleSaveSettings({
                      sms_enabled: settings?.sms_enabled,
                      sms_provider: settings?.sms_provider,
                      sms_sender_id: settings?.sms_sender_id,
                      sms_gateway_url: settings?.sms_gateway_url,
                      sms_api_key: settings?.sms_api_key,
                      payment_sms_template: settings?.payment_sms_template,
                      expiry_reminder_template: settings?.expiry_reminder_template,
                    })
                  }
                  className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving to Backend..." : "Save SMS Configuration"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB: COMPANY PROFILE & INVOICING ════════════════════════ */}
      {activeTab === "profile" && (
        <div className="max-w-3xl space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-500" />
                Company Branding & Billing Defaults
              </CardTitle>
              <CardDescription className="text-xs">
                Metadata displayed on customer receipts, invoices, client portal, and support contacts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Legal Business Name *</label>
                  <Input
                    value={settings?.company_name || ""}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, company_name: e.target.value } : null))
                    }
                    className="h-8 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Tagline / Slogan</label>
                  <Input
                    value={settings?.tagline || ""}
                    onChange={(e) => setSettings((prev) => (prev ? { ...prev, tagline: e.target.value } : null))}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Managing Director / Owner</label>
                  <Input
                    value={settings?.client_name || ""}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, client_name: e.target.value } : null))
                    }
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Tax / BIN / Trade License</label>
                  <Input
                    value={settings?.tax_number || ""}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, tax_number: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Support Phone Helpline</label>
                  <Input
                    value={settings?.support_phone || ""}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, support_phone: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Support Email Address</label>
                  <Input
                    type="email"
                    value={settings?.support_email || ""}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, support_email: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-foreground text-xs">Official Portal / Website</label>
                  <Input
                    value={settings?.website || ""}
                    onChange={(e) => setSettings((prev) => (prev ? { ...prev, website: e.target.value } : null))}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-foreground text-xs">Corporate Office Address</label>
                  <Input
                    value={settings?.address || ""}
                    onChange={(e) => setSettings((prev) => (prev ? { ...prev, address: e.target.value } : null))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Invoicing Prefixes */}
              <div className="pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Invoice Prefix</label>
                  <Input
                    value={settings?.invoice_prefix || "SHB-INV-"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, invoice_prefix: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Customer ID Prefix</label>
                  <Input
                    value={settings?.customer_id_prefix || "SHB-"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, customer_id_prefix: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Currency Symbol</label>
                  <Input
                    value={settings?.currency_symbol || "৳"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, currency_symbol: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Currency Code</label>
                  <Input
                    value={settings?.currency_code || "BDT"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, currency_code: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <Button
                  disabled={isSaving}
                  onClick={() =>
                    handleSaveSettings({
                      company_name: settings?.company_name,
                      tagline: settings?.tagline,
                      client_name: settings?.client_name,
                      tax_number: settings?.tax_number,
                      support_phone: settings?.support_phone,
                      support_email: settings?.support_email,
                      website: settings?.website,
                      address: settings?.address,
                      invoice_prefix: settings?.invoice_prefix,
                      customer_id_prefix: settings?.customer_id_prefix,
                      currency_symbol: settings?.currency_symbol,
                      currency_code: settings?.currency_code,
                    })
                  }
                  className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving to Backend..." : "Save Company Profile"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB: NETWORK DEFAULTS ════════════════════════ */}
      {activeTab === "network" && (
        <div className="max-w-3xl space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Server className="h-5 w-5 text-indigo-500" />
                Network Gateway & MikroTik Defaults
              </CardTitle>
              <CardDescription className="text-xs">
                Default API ports, socket connection timeouts, and recursive DNS servers for new MikroTik routers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Default RouterOS API Port</label>
                  <Input
                    type="number"
                    value={settings?.mikrotik_default_port ?? 8728}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, mikrotik_default_port: parseInt(e.target.value) || 8728 } : null
                      )
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Standard binary API port: 8728. For SSL: 8729.</p>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Socket Timeout (Seconds)</label>
                  <Input
                    type="number"
                    value={settings?.mikrotik_timeout_sec ?? 5}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, mikrotik_timeout_sec: parseInt(e.target.value) || 5 } : null
                      )
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Timeout before flagging gateway unresponsive.</p>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Primary DNS Server</label>
                  <Input
                    value={settings?.default_dns_primary || "8.8.8.8"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, default_dns_primary: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground text-xs">Secondary DNS Server</label>
                  <Input
                    value={settings?.default_dns_secondary || "1.1.1.1"}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, default_dns_secondary: e.target.value } : null))
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.mikrotik_auto_kick_on_expire ?? true}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, mikrotik_auto_kick_on_expire: e.target.checked } : null
                    )
                  }
                  className="h-4 w-4 rounded-xs border-border text-indigo-600"
                />
                <div>
                  <span className="font-semibold text-foreground block">Terminate Active Session on Expire</span>
                  <span className="text-[11px] text-muted-foreground">
                    Removes user from MikroTik active PPPoE connections immediately when expired.
                  </span>
                </div>
              </label>

              <div className="flex justify-end pt-3">
                <Button
                  disabled={isSaving}
                  onClick={() =>
                    handleSaveSettings({
                      mikrotik_default_port: settings?.mikrotik_default_port,
                      mikrotik_timeout_sec: settings?.mikrotik_timeout_sec,
                      mikrotik_auto_kick_on_expire: settings?.mikrotik_auto_kick_on_expire,
                      default_dns_primary: settings?.default_dns_primary,
                      default_dns_secondary: settings?.default_dns_secondary,
                    })
                  }
                  className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving to Backend..." : "Save Network Defaults"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ MODAL: ADD POP ZONE ════════════════════════ */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-base font-bold text-foreground mb-1">Add Area Name / Zone</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Create a new geographic optical distribution ring or area name.
            </p>
            <form onSubmit={handleSaveZone} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Zone Name *</label>
                <Input
                  required
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder="e.g. West Dhanmondi"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Zone Identifier Code</label>
                <Input
                  value={newZoneCode}
                  onChange={(e) => setNewZoneCode(e.target.value)}
                  placeholder="e.g. Z-WDH"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Location / Landmark</label>
                <Input
                  value={newZoneLocation}
                  onChange={(e) => setNewZoneLocation(e.target.value)}
                  placeholder="e.g. Road 11 Junction"
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsZoneModalOpen(false)}
                  disabled={isSubmittingZone}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingZone}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer"
                >
                  {isSubmittingZone ? "Saving Zone..." : "Save Zone"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════ MODAL: ADD TJ BOX ════════════════════════ */}
      {isBoxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="max-w-2xl w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative my-8 text-xs">
            <h3 className="text-base font-bold text-foreground mb-1">Add TJ Box / OLT Port</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Configure optical joint terminal box, fiber lines, and port core allocations.
            </p>

            <form onSubmit={handleSaveBox} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Box Name / ID *</label>
                  <Input
                    required
                    value={newBoxName}
                    onChange={(e) => setNewBoxName(e.target.value)}
                    placeholder="e.g. BOX-A1"
                    className="h-8 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Select Zone *</label>
                  <select
                    value={newBoxZone}
                    onChange={(e) => setNewBoxZone(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.name}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Box Category</label>
                  <select
                    value={newBoxCategory}
                    onChange={(e) => setNewBoxCategory(e.target.value as any)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="Master Box">Master Box</option>
                    <option value="Splitter Box">Splitter Box</option>
                    <option value="Zone/point Box">Zone/point Box</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Location (Lat, Long)</label>
                  <div className="flex gap-1.5">
                    <Input
                      value={newBoxLocation}
                      onChange={(e) => setNewBoxLocation(e.target.value)}
                      placeholder="23.8103, 90.4125"
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleGetLocation("add")}
                      disabled={isGettingLocation}
                      className="h-8 px-2.5 shrink-0 cursor-pointer text-xs"
                      title="Grab Current GPS"
                    >
                      <Navigation className={`h-3.5 w-3.5 mr-1 ${isGettingLocation ? "animate-spin" : ""}`} />
                      Get
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-foreground">Notes (e.g. sub-zone names separated by comma)</label>
                  <Input
                    value={newBoxNotes}
                    onChange={(e) => setNewBoxNotes(e.target.value)}
                    placeholder="e.g. SubZone-1, SubZone-2"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Dynamic Fiber Lines Builder with Core Configurator */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-foreground">Fiber Lines ({lines.length})</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddLine("add")}
                    className="h-6 text-[10px] gap-1 cursor-pointer text-emerald-600 hover:text-emerald-700"
                  >
                    <Plus className="h-3 w-3" /> Add Line
                  </Button>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {lines.map((line, lIdx) => (
                    <div key={line.id} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2.5">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
                          <select
                            value={line.category}
                            onChange={(e) => handleLineCategoryChange("add", line.id, e.target.value)}
                            className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground"
                          >
                            <option value="2core">2 Core</option>
                            <option value="4core">4 Core</option>
                            <option value="6core">6 Core</option>
                            <option value="8core">8 Core</option>
                            <option value="12core">12 Core</option>
                            <option value="24core">24 Core</option>
                            <option value="48core">48 Core</option>
                          </select>
                        </div>

                        <div className="col-span-2">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">In/Out</label>
                          <select
                            value={line.in_out}
                            onChange={(e) =>
                              setLines(
                                lines.map((l) =>
                                  l.id === line.id ? { ...l, in_out: e.target.value as "In" | "Out" } : l
                                )
                              )
                            }
                            className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground"
                          >
                            <option value="In">In</option>
                            <option value="Out">Out</option>
                          </select>
                        </div>

                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Brand</label>
                          <Input
                            placeholder="e.g. FiberHome"
                            value={line.brand}
                            onChange={(e) =>
                              setLines(lines.map((l) => (l.id === line.id ? { ...l, brand: e.target.value } : l)))
                            }
                            className="h-7 text-xs"
                          />
                        </div>

                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Code *</label>
                          <Input
                            required
                            placeholder="e.g. FIB-01"
                            value={line.code}
                            onChange={(e) =>
                              setLines(lines.map((l) => (l.id === line.id ? { ...l, code: e.target.value } : l)))
                            }
                            className="h-7 text-xs font-mono font-semibold"
                          />
                        </div>

                        <div className="col-span-1 flex items-center justify-end gap-1 pt-3">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine("add", line.id)}
                              className="text-muted-foreground hover:text-rose-500 cursor-pointer p-1"
                              title="Remove Line"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Cores Sub-configurator matching legacy configuration.php */}
                      <div className="pt-2 border-t border-border/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            Cores Configuration ({line.cores.length}):
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {line.cores.map((core) => {
                            const isUsed = core.status === "used";
                            return (
                              <div
                                key={core.number}
                                className={`flex items-center gap-1 p-1 rounded border text-[11px] ${
                                  isUsed
                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium"
                                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                <span className="font-bold text-[10px] text-muted-foreground pl-0.5">{core.number}:</span>

                                {/* Status Selector */}
                                <select
                                  value={core.status}
                                  onChange={(e) =>
                                    setLines(
                                      lines.map((l) =>
                                        l.id === line.id
                                          ? {
                                              ...l,
                                              cores: l.cores.map((c) =>
                                                c.number === core.number ? { ...c, status: e.target.value as any } : c
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="h-6 bg-transparent text-[10px] font-bold border-0 focus:outline-none cursor-pointer"
                                >
                                  <option value="free" className="text-emerald-600">
                                    Free
                                  </option>
                                  <option value="used" className="text-rose-600 font-bold">
                                    Used
                                  </option>
                                </select>

                                {/* Color Selector with Emojis */}
                                <select
                                  value={core.colorName}
                                  onChange={(e) =>
                                    setLines(
                                      lines.map((l) =>
                                        l.id === line.id
                                          ? {
                                              ...l,
                                              cores: l.cores.map((c) =>
                                                c.number === core.number ? { ...c, colorName: e.target.value } : c
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="h-6 bg-transparent text-[10px] border-l border-border px-1 focus:outline-none cursor-pointer"
                                >
                                  {FIBER_CORE_COLORS.map((col) => (
                                    <option key={col.name} value={col.name}>
                                      {col.emoji}
                                    </option>
                                  ))}
                                </select>

                                {/* Note */}
                                <input
                                  type="text"
                                  placeholder="Note"
                                  value={core.note}
                                  onChange={(e) =>
                                    setLines(
                                      lines.map((l) =>
                                        l.id === line.id
                                          ? {
                                              ...l,
                                              cores: l.cores.map((c) =>
                                                c.number === core.number ? { ...c, note: e.target.value } : c
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="h-6 w-full min-w-10 bg-transparent text-[10px] border-l border-border px-1 text-foreground focus:outline-none"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBoxModalOpen(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingBox}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  {isSubmittingBox ? "Saving Box..." : "Save Box"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════ MODAL: EDIT TJ BOX ════════════════════════ */}
      {isEditBoxModalOpen && editingBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="max-w-2xl w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative my-8 text-xs">
            <h3 className="text-base font-bold text-foreground mb-1">Edit TJ Box</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Update terminal joint box configuration, connected fiber lines, and port cores.
            </p>

            <form onSubmit={handleUpdateBox} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Box Name / ID *</label>
                  <Input
                    required
                    value={editBoxName}
                    onChange={(e) => setEditBoxName(e.target.value)}
                    className="h-8 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Select Zone *</label>
                  <select
                    value={editBoxZone}
                    onChange={(e) => setEditBoxZone(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.name}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Box Category</label>
                  <select
                    value={editBoxCategory}
                    onChange={(e) => setEditBoxCategory(e.target.value as any)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="Master Box">Master Box</option>
                    <option value="Splitter Box">Splitter Box</option>
                    <option value="Zone/point Box">Zone/point Box</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Location (Lat, Long)</label>
                  <div className="flex gap-1.5">
                    <Input
                      value={editBoxLocation}
                      onChange={(e) => setEditBoxLocation(e.target.value)}
                      placeholder="23.8103, 90.4125"
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleGetLocation("edit")}
                      disabled={isGettingLocation}
                      className="h-8 px-2.5 shrink-0 cursor-pointer text-xs"
                      title="Grab Current GPS"
                    >
                      <Navigation className={`h-3.5 w-3.5 mr-1 ${isGettingLocation ? "animate-spin" : ""}`} />
                      Get
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-semibold text-foreground">Notes (e.g. sub-zone names separated by comma)</label>
                  <Input
                    value={editBoxNotes}
                    onChange={(e) => setEditBoxNotes(e.target.value)}
                    placeholder="e.g. SubZone-1, SubZone-2"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Dynamic Fiber Lines Builder with Core Configurator */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-foreground">Fiber Lines ({editLines.length})</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddLine("edit")}
                    className="h-6 text-[10px] gap-1 cursor-pointer text-emerald-600 hover:text-emerald-700"
                  >
                    <Plus className="h-3 w-3" /> Add Line
                  </Button>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {editLines.map((line, lIdx) => (
                    <div key={line.id} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2.5">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
                          <select
                            value={line.category}
                            onChange={(e) => handleLineCategoryChange("edit", line.id, e.target.value)}
                            className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground"
                          >
                            <option value="2core">2 Core</option>
                            <option value="4core">4 Core</option>
                            <option value="6core">6 Core</option>
                            <option value="8core">8 Core</option>
                            <option value="12core">12 Core</option>
                            <option value="24core">24 Core</option>
                            <option value="48core">48 Core</option>
                          </select>
                        </div>

                        <div className="col-span-2">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">In/Out</label>
                          <select
                            value={line.in_out}
                            onChange={(e) =>
                              setEditLines(
                                editLines.map((l) =>
                                  l.id === line.id ? { ...l, in_out: e.target.value as "In" | "Out" } : l
                                )
                              )
                            }
                            className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground"
                          >
                            <option value="In">In</option>
                            <option value="Out">Out</option>
                          </select>
                        </div>

                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Brand</label>
                          <Input
                            placeholder="e.g. FiberHome"
                            value={line.brand}
                            onChange={(e) =>
                              setEditLines(
                                editLines.map((l) => (l.id === line.id ? { ...l, brand: e.target.value } : l))
                              )
                            }
                            className="h-7 text-xs"
                          />
                        </div>

                        <div className="col-span-3">
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Code *</label>
                          <Input
                            required
                            placeholder="e.g. FIB-01"
                            value={line.code}
                            onChange={(e) =>
                              setEditLines(
                                editLines.map((l) => (l.id === line.id ? { ...l, code: e.target.value } : l))
                              )
                            }
                            className="h-7 text-xs font-mono font-semibold"
                          />
                        </div>

                        <div className="col-span-1 flex items-center justify-end gap-1 pt-3">
                          {editLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine("edit", line.id)}
                              className="text-muted-foreground hover:text-rose-500 cursor-pointer p-1"
                              title="Remove Line"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Cores Sub-configurator */}
                      <div className="pt-2 border-t border-border/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            Cores Configuration ({line.cores.length}):
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {line.cores.map((core) => {
                            const isUsed = core.status === "used";
                            return (
                              <div
                                key={core.number}
                                className={`flex items-center gap-1 p-1 rounded border text-[11px] ${
                                  isUsed
                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium"
                                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                <span className="font-bold text-[10px] text-muted-foreground pl-0.5">{core.number}:</span>

                                {/* Status Selector */}
                                <select
                                  value={core.status}
                                  onChange={(e) =>
                                    setEditLines(
                                      editLines.map((l) =>
                                        l.id === line.id
                                          ? {
                                              ...l,
                                              cores: l.cores.map((c) =>
                                                c.number === core.number ? { ...c, status: e.target.value as any } : c
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="h-6 bg-transparent text-[10px] font-bold border-0 focus:outline-none cursor-pointer"
                                >
                                  <option value="free" className="text-emerald-600">
                                    Free
                                  </option>
                                  <option value="used" className="text-rose-600 font-bold">
                                    Used
                                  </option>
                                </select>

                                {/* Color Selector with Emojis */}
                                <select
                                  value={core.colorName}
                                  onChange={(e) =>
                                    setEditLines(
                                      editLines.map((l) =>
                                        l.id === line.id
                                          ? {
                                              ...l,
                                              cores: l.cores.map((c) =>
                                                c.number === core.number ? { ...c, colorName: e.target.value } : c
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="h-6 bg-transparent text-[10px] border-l border-border px-1 focus:outline-none cursor-pointer"
                                >
                                  {FIBER_CORE_COLORS.map((col) => (
                                    <option key={col.name} value={col.name}>
                                      {col.emoji}
                                    </option>
                                  ))}
                                </select>

                                {/* Note */}
                                <input
                                  type="text"
                                  placeholder="Note"
                                  value={core.note}
                                  onChange={(e) =>
                                    setEditLines(
                                      editLines.map((l) =>
                                        l.id === line.id
                                          ? {
                                              ...l,
                                              cores: l.cores.map((c) =>
                                                c.number === core.number ? { ...c, note: e.target.value } : c
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="h-6 w-full min-w-10 bg-transparent text-[10px] border-l border-border px-1 text-foreground focus:outline-none"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditBoxModalOpen(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isUpdatingBox}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer"
                >
                  {isUpdatingBox ? "Updating Box..." : "Update Box"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════ MODAL: VIEW FIBER NETWORK MAP ════════════════════════ */}
      <FiberNetworkMapModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        boxes={boxes}
      />

      {/* ════════════════════════ MODAL: TEST SMS ════════════════════════ */}
      {isTestSmsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-500">
                <Smartphone className="h-5 w-5" />
                <h3 className="text-base font-bold text-foreground">Test SMS Gateway Delivery</h3>
              </div>
              <button
                onClick={() => setIsTestSmsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {testSmsStatus && (
              <div className="p-2.5 rounded-lg bg-muted/60 border border-border text-[11px] text-foreground font-mono">
                {testSmsStatus}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Recipient Mobile Number *</label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+880 1700-000000"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Test Message Content</label>
                <textarea
                  rows={3}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTestSmsModalOpen(false)}
                className="h-8 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSendingTestSms}
                onClick={handleSendTestSms}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                {isSendingTestSms ? "Dispatching..." : "Send Test SMS"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
