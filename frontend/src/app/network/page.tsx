"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Server,
  Radio,
  Users,
  Activity,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Power,
  Zap,
  Wifi,
  HardDrive,
  Cpu,
  Clock,
  Search,
  ChevronRight,
  ArrowUpRight,
  Sliders,
  Filter,
  Check,
  X,
  Gauge,
  Layers,
  MapPin,
  ExternalLink,
  RotateCcw,
  Play,
  CheckCircle2,
  XCircle,
  ListOrdered,
  ArrowRight,
  ArrowLeft,
  Shield,
  Terminal,
  GitFork,
  Globe,
  Compass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import {
  NetworkCockpitDashboard,
  RouterCockpitDetail,
  OLTCockpitDetail,
  CustomerNetworkStatus,
  Router,
  OLT,
  PPPoESecretItem,
  ReconciliationRun,
  ReconciliationStatus,
  NetworkActionItem,
  BulkPreviewResult,
  BulkNetworkBatch,
  Package,
  RouterPingResult,
  RouterTracerouteResult,
} from "@/types";
import { WireGuardPanel } from "@/components/network/WireGuardPanel";
import { RouterDiagnosticsModal } from "@/components/network/RouterDiagnosticsModal";
import { UnregisteredSecretsModal } from "@/components/network/UnregisteredSecretsModal";
import { OLTTerminalModal } from "@/components/network/OLTTerminalModal";
import FiberNetworkMapModal, { MapTJBox } from "@/components/network/FiberNetworkMapModal";

export default function NetworkCockpitPage() {
  // Navigation tabs (Unified 6-Tab NOC Core + Specialized Workflows)
  const [activeTab, setActiveTab] = useState<
    "overview" | "routers" | "diagnostics" | "olts" | "vpn" | "topology" | "customer" | "reconciliation" | "actions"
  >("overview");

  // Operational Modals State
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [diagnosticsRouter, setDiagnosticsRouter] = useState<Router | null>(null);

  const [unregisteredModalOpen, setUnregisteredModalOpen] = useState(false);
  const [unregisteredRouter, setUnregisteredRouter] = useState<Router | null>(null);

  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [terminalOlt, setTerminalOlt] = useState<OLT | null>(null);

  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapBoxes, setMapBoxes] = useState<MapTJBox[]>([]);
  const [loadingMapBoxes, setLoadingMapBoxes] = useState(false);

  // Dedicated Diagnostics Tab State
  const [diagSelectedRouterId, setDiagSelectedRouterId] = useState<string>("");
  const [diagTarget, setDiagTarget] = useState<string>("8.8.8.8");
  const [diagCount, setDiagCount] = useState<number>(4);
  const [diagTool, setDiagTool] = useState<"ping" | "traceroute">("ping");
  const [diagRunning, setDiagRunning] = useState<boolean>(false);
  const [diagPingResult, setDiagPingResult] = useState<RouterPingResult | null>(null);
  const [diagTraceResult, setDiagTraceResult] = useState<RouterTracerouteResult | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);


  // Dashboard Overview state
  const [cockpitData, setCockpitData] = useState<NetworkCockpitDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string>("");

  // Router Drilldown state (Router -> Customers)
  const [routersList, setRoutersList] = useState<Router[]>([]);
  const [selectedRouterId, setSelectedRouterId] = useState<string>("");
  const [routerDetail, setRouterDetail] = useState<RouterCockpitDetail | null>(null);
  const [loadingRouterDetail, setLoadingRouterDetail] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");

  // OLT Drilldown state (OLT -> ONUs)
  const [oltsList, setOltsList] = useState<OLT[]>([]);
  const [selectedOltId, setSelectedOltId] = useState<string>("");
  const [oltDetail, setOltDetail] = useState<OLTCockpitDetail | null>(null);
  const [loadingOltDetail, setLoadingOltDetail] = useState(false);
  const [onuSearchQuery, setOnuSearchQuery] = useState("");

  // Customer -> Service Status Panel state
  const [activeCustomerCode, setActiveCustomerCode] = useState("");
  const [activeCustomerStatus, setActiveCustomerStatus] = useState<CustomerNetworkStatus | null>(null);
  const [loadingCustomerStatus, setLoadingCustomerStatus] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  // Operational Action Execution
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Phase 12: PPPoE Reconciliation State
  const [reconciliationSecrets, setReconciliationSecrets] = useState<PPPoESecretItem[]>([]);
  const [reconciliationRuns, setReconciliationRuns] = useState<ReconciliationRun[]>([]);
  const [loadingReconciliation, setLoadingReconciliation] = useState(false);
  const [reconcilingRouterId, setReconcilingRouterId] = useState<string | null>(null);
  const [reconciliationStatusFilter, setReconciliationStatusFilter] = useState<string>("ALL");
  const [reconciliationSearch, setReconciliationSearch] = useState("");
  const [selectedSecretForDetail, setSelectedSecretForDetail] = useState<PPPoESecretItem | null>(null);
  const [safeSyncLoading, setSafeSyncLoading] = useState<string | null>(null);
  const [safeSyncFeedback, setSafeSyncFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadReconciliation() {
    setLoadingReconciliation(true);
    try {
      const [secs, runs] = await Promise.all([
        ApiClient.getReconciliationSecrets({
          router_id: selectedRouterId || undefined,
          status: reconciliationStatusFilter !== "ALL" ? reconciliationStatusFilter : undefined,
          search: reconciliationSearch || undefined,
        }),
        ApiClient.getReconciliationRuns(),
      ]);
      setReconciliationSecrets(secs);
      setReconciliationRuns(runs);
    } catch (e) {
      console.error("Failed to load reconciliation state:", e);
    } finally {
      setLoadingReconciliation(false);
    }
  }

  async function handleTriggerReconciliation() {
    if (!selectedRouterId) return;
    setReconcilingRouterId(selectedRouterId);
    setSafeSyncFeedback(null);
    try {
      const res = await ApiClient.triggerReconciliation(selectedRouterId);
      setSafeSyncFeedback({
        type: "success",
        text: `Reconciliation completed: ${res.matched} matched, ${res.missing} missing, ${res.orphans} orphans, ${res.profile_mismatches} profile mismatches, ${res.status_mismatches} status mismatches.`,
      });
      await loadReconciliation();
      await loadDashboard(true);
    } catch (e: any) {
      setSafeSyncFeedback({ type: "error", text: e.message || "Reconciliation trigger failed" });
    } finally {
      setReconcilingRouterId(null);
    }
  }

  async function handleSafeSync(item: PPPoESecretItem, action: string) {
    setSafeSyncLoading(item.id);
    setSafeSyncFeedback(null);
    try {
      const res = await ApiClient.safeSyncReconciliationItem(item.id, action);
      setSafeSyncFeedback({ type: "success", text: res.message || "Discrepancy resolved safely." });
      await loadReconciliation();
      if (selectedSecretForDetail?.id === item.id) {
        setSelectedSecretForDetail(null);
      }
    } catch (e: any) {
      setSafeSyncFeedback({ type: "error", text: e.message || "Safe sync failed" });
    } finally {
      setSafeSyncLoading(null);
    }
  }

  // Phase 13: Action Queue & Bulk Operations State
  const [actionsList, setActionsList] = useState<NetworkActionItem[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionStatusFilter, setActionStatusFilter] = useState<string>("ALL");
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("ALL");
  const [actionRouterFilter, setActionRouterFilter] = useState<string>("ALL");
  const [actionSearchQuery, setActionSearchQuery] = useState("");
  const [actionItemLoading, setActionItemLoading] = useState<string | null>(null);

  // Bulk Operations Wizard State
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<1 | 2 | 3 | 4>(1);
  const [bulkActionType, setBulkActionType] = useState<string>("DISABLE_SERVICE");
  const [bulkRouterId, setBulkRouterId] = useState<string>("");
  const [bulkStatusFilter, setBulkStatusFilter] = useState<string>("ALL");
  const [bulkArea, setBulkArea] = useState<string>("ALL");
  const [bulkPackageId, setBulkPackageId] = useState<string>("");
  const [packagesList, setPackagesList] = useState<Package[]>([]);
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewResult | null>(null);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkExecuting, setBulkExecuting] = useState(false);
  const [activeBatch, setActiveBatch] = useState<BulkNetworkBatch | null>(null);
  const [bulkBatchesList, setBulkBatchesList] = useState<BulkNetworkBatch[]>([]);

  async function loadNetworkActions() {
    setLoadingActions(true);
    try {
      const actions = await ApiClient.getNetworkActions({
        status: actionStatusFilter !== "ALL" ? actionStatusFilter : undefined,
        action: actionTypeFilter !== "ALL" ? actionTypeFilter : undefined,
        router_id: actionRouterFilter !== "ALL" ? actionRouterFilter : undefined,
        search: actionSearchQuery || undefined,
      });
      setActionsList(actions);
    } catch (e) {
      console.error("Failed to load network actions:", e);
    } finally {
      setLoadingActions(false);
    }
  }

  async function loadBulkBatches() {
    try {
      const batches = await ApiClient.getBulkBatches();
      setBulkBatchesList(batches);
    } catch (e) {
      console.error("Failed to load bulk batches:", e);
    }
  }

  async function handleRetryAction(actionId: string) {
    setActionItemLoading(actionId);
    try {
      await ApiClient.retryNetworkAction(actionId);
      await loadNetworkActions();
      await loadDashboard(true);
    } catch (e: any) {
      console.error("Retry failed:", e);
    } finally {
      setActionItemLoading(null);
    }
  }

  async function handleCancelAction(actionId: string) {
    setActionItemLoading(actionId);
    try {
      await ApiClient.cancelNetworkAction(actionId);
      await loadNetworkActions();
      await loadDashboard(true);
    } catch (e: any) {
      console.error("Cancel failed:", e);
    } finally {
      setActionItemLoading(null);
    }
  }

  async function handleRunBulkPreview() {
    setBulkPreviewLoading(true);
    try {
      const filterCriteria: Record<string, any> = {};
      if (bulkRouterId) filterCriteria.router_id = bulkRouterId;
      if (bulkStatusFilter !== "ALL") filterCriteria.status = bulkStatusFilter;
      if (bulkArea !== "ALL") filterCriteria.area_zone = bulkArea;

      const payload: Record<string, any> = {};
      if (bulkPackageId) payload.package_id = bulkPackageId;

      const preview = await ApiClient.previewBulkOperation({
        action_type: bulkActionType,
        filter_criteria: filterCriteria,
        payload,
      });
      setBulkPreview(preview);
      setBulkStep(2);
    } catch (e: any) {
      console.error("Bulk preview failed:", e);
    } finally {
      setBulkPreviewLoading(false);
    }
  }

  async function handleConfirmBulkQueue() {
    setBulkExecuting(true);
    try {
      const filterCriteria: Record<string, any> = {};
      if (bulkRouterId) filterCriteria.router_id = bulkRouterId;
      if (bulkStatusFilter !== "ALL") filterCriteria.status = bulkStatusFilter;
      if (bulkArea !== "ALL") filterCriteria.area_zone = bulkArea;

      const payload: Record<string, any> = {};
      if (bulkPackageId) payload.package_id = bulkPackageId;

      const batch = await ApiClient.confirmBulkOperation({
        action_type: bulkActionType,
        filter_criteria: filterCriteria,
        payload,
      });
      setActiveBatch(batch);
      setBulkStep(4);
      pollActiveBatch(batch.id);
    } catch (e: any) {
      console.error("Bulk confirm failed:", e);
      setBulkExecuting(false);
    }
  }

  function pollActiveBatch(batchId: string) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const batch = await ApiClient.getBulkBatchDetail(batchId);
        setActiveBatch(batch);
        if (batch.status === "COMPLETED" || batch.status === "CANCELLED" || attempts > 60) {
          clearInterval(interval);
          setBulkExecuting(false);
          loadNetworkActions();
          loadDashboard(true);
        }
      } catch {
        clearInterval(interval);
        setBulkExecuting(false);
      }
    }, 1500);
  }

  // Initial Load
  useEffect(() => {
    loadDashboard(false);
    loadDevices();
  }, [selectedArea]);

  useEffect(() => {
    if (activeTab === "reconciliation") {
      loadReconciliation();
    }
    if (activeTab === "actions") {
      loadNetworkActions();
      loadBulkBatches();
    }
  }, [
    activeTab,
    selectedRouterId,
    reconciliationStatusFilter,
    reconciliationSearch,
    actionStatusFilter,
    actionTypeFilter,
    actionRouterFilter,
    actionSearchQuery,
  ]);

  useEffect(() => {
    if (bulkModalOpen && packagesList.length === 0) {
      ApiClient.getPackages().then(setPackagesList).catch(console.error);
    }
    if (bulkModalOpen && !bulkRouterId && routersList.length > 0) {
      setBulkRouterId(routersList[0].id);
    }
  }, [bulkModalOpen, routersList]);


  // Auto-refresh interval (15s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadDashboard(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedArea]);

  async function loadDashboard(silent = false) {
    if (!silent) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const data = await ApiClient.getNetworkCockpit({
        area: selectedArea || undefined,
        refresh: true,
      });
      setCockpitData(data);
    } catch (err) {
      console.error("Failed to load cockpit overview:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  async function loadDevices() {
    try {
      const [r, o] = await Promise.all([ApiClient.getRouters(), ApiClient.getOLTs()]);
      setRoutersList(r);
      if (r.length > 0) {
        if (!selectedRouterId) {
          setSelectedRouterId(r[0].id);
          loadRouterDetail(r[0].id);
        }
        if (!diagSelectedRouterId) {
          setDiagSelectedRouterId(r[0].id);
        }
      }
      setOltsList(o);
      if (o.length > 0 && !selectedOltId) {
        setSelectedOltId(o[0].id);
        loadOltDetail(o[0].id);
      }
    } catch (err) {
      console.error("Failed to load device list:", err);
    }
  }

  async function loadMapBoxes() {
    setLoadingMapBoxes(true);
    try {
      const data = await ApiClient.getTJBoxes();
      const list = Array.isArray(data) ? data : [];
      const mapped: MapTJBox[] = list.map((b: any) => ({
        id: b.id,
        name: b.name,
        zone: b.zone_name || b.zone || "Default Zone",
        category: (b.box_category as any) || "Master Box",
        location: b.lat_long || (b.latitude && b.longitude ? `${b.latitude}, ${b.longitude}` : ""),
        notes: b.notes || "",
        lines: [],
      }));
      setMapBoxes(mapped);
      setMapModalOpen(true);
    } catch (e) {
      console.error("Failed to load TJ boxes for GIS map:", e);
    } finally {
      setLoadingMapBoxes(false);
    }
  }

  async function handleRunTabDiagnostic() {
    if (!diagSelectedRouterId || !diagTarget.trim()) return;
    setDiagRunning(true);
    setDiagError(null);
    setDiagPingResult(null);
    setDiagTraceResult(null);

    try {
      if (diagTool === "ping") {
        const res = await ApiClient.routerPing(diagSelectedRouterId, diagTarget.trim(), diagCount);
        setDiagPingResult(res);
      } else {
        const res = await ApiClient.routerTraceroute(diagSelectedRouterId, diagTarget.trim());
        setDiagTraceResult(res);
      }
    } catch (err: any) {
      setDiagError(err?.message || "Diagnostic probe failed.");
    } finally {
      setDiagRunning(false);
    }
  }

  async function loadRouterDetail(routerId: string) {
    if (!routerId) return;
    setLoadingRouterDetail(true);
    try {
      const data = await ApiClient.getRouterCockpit(routerId, selectedArea || undefined);
      setRouterDetail(data);
    } catch (err) {
      console.error("Failed to load router operational detail:", err);
    } finally {
      setLoadingRouterDetail(false);
    }
  }

  async function loadOltDetail(oltId: string) {
    if (!oltId) return;
    setLoadingOltDetail(true);
    try {
      const data = await ApiClient.getOLTCockpit(oltId);
      setOltDetail(data);
    } catch (err) {
      console.error("Failed to load OLT operational detail:", err);
    } finally {
      setLoadingOltDetail(false);
    }
  }

  async function openCustomerDiagnostic(customerId: string) {
    setLoadingCustomerStatus(true);
    setCustomerModalOpen(true);
    setActionMessage(null);
    try {
      const data = await ApiClient.getCustomerNetworkStatus(customerId);
      setActiveCustomerStatus(data);
    } catch (err) {
      console.error("Failed to load customer network status:", err);
      setActionMessage({ type: "error", text: "Could not fetch subscriber operational status." });
    } finally {
      setLoadingCustomerStatus(false);
    }
  }

  async function executeOperatorAction(action: "disconnect" | "sync_profile" | "reboot_onu") {
    if (!activeCustomerStatus?.customer?.id) return;
    setActionLoading(action);
    setActionMessage(null);
    try {
      const res = await ApiClient.triggerCustomerNetworkAction(activeCustomerStatus.customer.id, action);
      setActionMessage({ type: "success", text: res.message || "Action executed successfully." });
      // Refresh current customer view & dashboard
      const updated = await ApiClient.getCustomerNetworkStatus(activeCustomerStatus.customer.id);
      setActiveCustomerStatus(updated);
      loadDashboard(true);
      if (selectedRouterId) loadRouterDetail(selectedRouterId);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to execute network action." });
    } finally {
      setActionLoading(null);
    }
  }

  // Filtered customer list in Router View
  const filteredCustomers = useMemo(() => {
    if (!routerDetail?.customers) return [];
    if (!customerSearchQuery.trim()) return routerDetail.customers;
    const q = customerSearchQuery.toLowerCase();
    return routerDetail.customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.customer_code.toLowerCase().includes(q) ||
        c.pppoe_username.toLowerCase().includes(q) ||
        c.static_ip.includes(q)
    );
  }, [routerDetail, customerSearchQuery]);

  // Filtered ONU list in OLT View
  const filteredOnus = useMemo(() => {
    if (!oltDetail?.onus) return [];
    if (!onuSearchQuery.trim()) return oltDetail.onus;
    const q = onuSearchQuery.toLowerCase();
    return oltDetail.onus.filter(
      (o) =>
        o.customer_name.toLowerCase().includes(q) ||
        o.pon_port.toLowerCase().includes(q) ||
        o.mac_address.toLowerCase().includes(q) ||
        o.serial_number.toLowerCase().includes(q)
    );
  }, [oltDetail, onuSearchQuery]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
              Operations Cockpit
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs text-muted-foreground font-mono">Live Telemetry</span>
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight mt-1 flex items-center gap-2.5">
            Network Operations Cockpit
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Carrier-grade network observability: MikroTik BNG routers, GPON/EPON frames, and fiber subscribers.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Area Filter */}
          <div className="flex items-center gap-1.5 bg-background/80 border border-border/80 rounded-lg px-2.5 py-1.5 shadow-sm text-xs">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-xs text-foreground cursor-pointer font-medium"
            >
              <option value="">All Zones / Areas</option>
              {cockpitData?.area_breakdown.map((az) => (
                <option key={az.area_zone} value={az.area_zone}>
                  {az.area_zone} ({az.total_subscribers})
                </option>
              ))}
            </select>
          </div>

          {/* Auto Refresh Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs gap-1.5 h-9 ${
              autoRefresh ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" : ""
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {autoRefresh ? "Auto (15s)" : "Paused"}
          </Button>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboard(false)}
            disabled={isRefreshing}
            className="text-xs gap-1.5 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ════════════════════════ PRIMARY KPI DECK (Exact Phase 11 Specification) ════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Routers */}
        <Card className="bg-card hover:border-primary/40 transition-all shadow-sm">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Routers</span>
              <Server className="w-4 h-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {cockpitData?.routers.total ?? 24}
              </span>
              <span className="text-xs text-muted-foreground font-medium">total</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-[11px] font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {cockpitData?.routers.healthy ?? 22} healthy
              </span>
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                {cockpitData?.routers.degraded ?? 2} degraded
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Customers */}
        <Card className="bg-card hover:border-primary/40 transition-all shadow-sm">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customers</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {(cockpitData?.customers.online ?? 8421).toLocaleString()}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">online</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] font-mono">
              <span className="text-muted-foreground">
                {(cockpitData?.customers.offline ?? 1238).toLocaleString()} offline
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {(cockpitData?.customers.total ?? 9659).toLocaleString()} total
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Pending Actions */}
        <Card className="bg-card hover:border-primary/40 transition-all shadow-sm">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending</span>
              <Activity className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {cockpitData?.pending_actions ?? 13}
              </span>
              <span className="text-xs text-muted-foreground font-medium">queued</span>
            </div>
            <div className="flex items-center gap-1.5 pt-1 border-t border-border/40 text-[11px] font-mono text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <span>In-flight Celery jobs</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Failed Actions */}
        <Card className="bg-card hover:border-destructive/40 transition-all shadow-sm">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Failed</span>
              <AlertCircle className="w-4 h-4 text-destructive" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-destructive">
                {cockpitData?.failed_actions ?? 4}
              </span>
              <span className="text-xs text-destructive font-medium">actions</span>
            </div>
            <div className="flex items-center gap-1 pt-1 border-t border-border/40 text-[11px] font-mono text-destructive">
              <AlertTriangle className="w-3 h-3" />
              <span>Needs inspection</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: OLT */}
        <Card className="bg-card hover:border-primary/40 transition-all shadow-sm">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OLT</span>
              <Radio className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {cockpitData?.olt.healthy ?? 18}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">healthy</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] font-mono">
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                {cockpitData?.olt.degraded ?? 1} degraded
              </span>
              <span className="text-muted-foreground">
                {cockpitData?.olt.total ?? 19} total
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 6: ONU */}
        <Card className="bg-card hover:border-primary/40 transition-all shadow-sm">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ONU</span>
              <Wifi className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {(cockpitData?.onu.online ?? 12421).toLocaleString()}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">online</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] font-mono">
              <span className="text-muted-foreground">
                {cockpitData?.onu.offline ?? 93} offline
              </span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                {cockpitData?.onu.optical_alerts ?? 14} alerts
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Cockpit Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Layers className="w-4 h-4" />
          Cockpit Overview & POPs
        </button>

        <button
          onClick={() => setActiveTab("routers")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "routers"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Server className="w-4 h-4" />
          Router → Customers
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-mono">
            {routersList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "diagnostics"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Activity className="w-4 h-4" />
          Diagnostic Tools
        </button>

        <button
          onClick={() => setActiveTab("olts")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "olts"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Radio className="w-4 h-4" />
          OLT → ONUs
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-mono">
            {oltsList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("vpn")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "vpn"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Shield className="w-4 h-4" />
          WireGuard VPN
        </button>

        <button
          onClick={() => setActiveTab("topology")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "topology"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <GitFork className="w-4 h-4" />
          Fiber Topology & GIS
        </button>

        <button
          onClick={() => setActiveTab("customer")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "customer"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Zap className="w-4 h-4" />
          Customer Status
        </button>

        <button
          onClick={() => setActiveTab("reconciliation")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "reconciliation"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Sliders className="w-4 h-4" />
          PPPoE Reconciliation
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-mono">
            Audit
          </span>
        </button>

        <button
          onClick={() => setActiveTab("actions")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "actions"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          Action Queue & Bulk Ops
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/20 font-mono">
            Queue
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/online-sessions"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            Live Sessions
            <ArrowUpRight className="w-3 h-3 ml-0.5 opacity-60" />
          </Link>
          <Link
            href="/topology"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-all border border-indigo-500/20"
          >
            <Layers className="w-3.5 h-3.5" />
            Fiber Map & Blast Radius
            <ArrowUpRight className="w-3 h-3 ml-0.5 opacity-60" />
          </Link>
          <Link
            href="/olt"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition-all border border-cyan-500/20"
          >
            <Radio className="w-3.5 h-3.5" />
            OLT / ONU Auto-Match
            <ArrowUpRight className="w-3 h-3 ml-0.5 opacity-60" />
          </Link>
        </div>
      </div>

      {/* ════════════════════════ TAB 1: OVERVIEW & POPS ════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Active PPPoE Session Summary & Failure Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live PPPoE Session & Traffic Throughput */}
            <Card className="lg:col-span-1 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span>Live PPPoE Sessions</span>
                  <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Aggregate subscriber traffic streamed from MikroTik BNGs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-xl p-4 border border-border/50 text-center space-y-1">
                  <div className="text-3xl font-extrabold font-mono text-foreground">
                    {(cockpitData?.sessions.total_active ?? 8421).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Concurrent PPPoE Tunnels
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/40">
                    <div className="text-muted-foreground text-[10px] uppercase">Download (In)</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {cockpitData ? `${Math.round(cockpitData.sessions.bytes_in / (1024 ** 3))} GB` : "41.2 TB"}
                    </div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/40">
                    <div className="text-muted-foreground text-[10px] uppercase">Upload (Out)</div>
                    <div className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                      {cockpitData ? `${Math.round(cockpitData.sessions.bytes_out / (1024 ** 3))} GB` : "185.6 TB"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-primary" /> Avg Router CPU
                    </span>
                    <span className="font-mono font-semibold">{cockpitData?.routers.avg_cpu_usage ?? 34.2}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-cyan-500" /> Avg Memory
                    </span>
                    <span className="font-mono font-semibold">{cockpitData?.routers.avg_memory_usage ?? 52.8}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Network Action Failures Stream */}
            <Card className="lg:col-span-2 shadow-sm border-destructive/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      Recent Network Failures Stream
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Live sync jobs requiring operator attention or hardware verification
                    </CardDescription>
                  </div>
                  <Badge variant="destructive" className="font-mono text-xs">
                    {cockpitData?.failed_actions ?? 4} Unresolved
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {cockpitData?.recent_failures && cockpitData.recent_failures.length > 0 ? (
                  <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {cockpitData.recent_failures.map((f) => (
                      <div
                        key={f.id}
                        className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono text-[10px]">
                              {f.action}
                            </span>
                            {f.router_name && (
                              <span className="text-foreground flex items-center gap-1 font-mono text-[11px]">
                                <Server className="w-3 h-3 text-muted-foreground" />
                                {f.router_name}
                              </span>
                            )}
                            {f.pppoe_username && (
                              <span className="text-muted-foreground font-mono text-[11px]">
                                ({f.pppoe_username})
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-destructive/90 font-mono break-all">{f.error_message}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {new Date(f.created_at).toLocaleTimeString()}
                          </span>
                          <div className="text-[10px] text-muted-foreground">Retries: {f.retry_count}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground text-xs flex flex-col items-center gap-2">
                    <CheckCircle className="w-8 h-8 text-emerald-500/80" />
                    <span>All network synchronization jobs healthy. No recent device errors.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* POP Branches and Area Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* POP Branches */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  POP Branches Capacity Overview
                </CardTitle>
                <CardDescription className="text-xs">
                  Physical distribution points, capacity limit, and active subscriber load
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {cockpitData?.pop_branches && cockpitData.pop_branches.length > 0 ? (
                    cockpitData.pop_branches.map((p) => {
                      const pct = Math.min(100, Math.round((p.customer_count / (p.total_capacity || 1)) * 100));
                      return (
                        <div key={p.id} className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground">{p.name}</span>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {p.code}
                            </Badge>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct > 85 ? "bg-rose-500" : pct > 65 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                            <span>
                              {p.customer_count.toLocaleString()} / {p.total_capacity.toLocaleString()} subs
                            </span>
                            <span className="font-semibold text-foreground">{pct}% capacity</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-xs text-muted-foreground">No POP branches found.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Area Zone Breakdown */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-500" />
                  Area Zone Operational Breakdown
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time subscriber presence categorized by distribution zone
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground font-mono">
                        <th className="pb-2 font-medium">Zone</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                        <th className="pb-2 font-medium text-right text-emerald-600 dark:text-emerald-400">Online</th>
                        <th className="pb-2 font-medium text-right text-muted-foreground">Offline</th>
                        <th className="pb-2 font-medium text-right text-rose-600 dark:text-rose-400">Expired</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-mono">
                      {cockpitData?.area_breakdown && cockpitData.area_breakdown.length > 0 ? (
                        cockpitData.area_breakdown.map((z) => (
                          <tr key={z.area_zone} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 font-sans font-medium text-foreground">{z.area_zone}</td>
                            <td className="py-2.5 text-right font-bold">{z.total_subscribers}</td>
                            <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                              {z.online_count}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">{z.offline_count}</td>
                            <td className="py-2.5 text-right text-rose-600 dark:text-rose-400">{z.expired_count}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">
                            No area zones recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ════════════════════════ TAB 2: ROUTER → CUSTOMERS ════════════════════════ */}
      {activeTab === "routers" && (
        <div className="space-y-6">
          {/* Router Selection Bar & Live Metrics */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-primary shrink-0" />
              <div>
                <label className="text-xs text-muted-foreground uppercase font-mono">Select Core Router</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <select
                    value={selectedRouterId}
                    onChange={(e) => {
                      setSelectedRouterId(e.target.value);
                      loadRouterDetail(e.target.value);
                    }}
                    className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {routersList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.ip_address}) - {r.status}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadRouterDetail(selectedRouterId)}
                    disabled={loadingRouterDetail}
                    className="h-8 text-xs"
                    title="Refresh Router Telemetry"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingRouterDetail ? "animate-spin" : ""}`} />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const r = routersList.find((x) => x.id === selectedRouterId) || null;
                      setDiagnosticsRouter(r);
                      setDiagnosticsModalOpen(true);
                    }}
                    className="h-8 text-xs gap-1.5 font-semibold text-primary hover:bg-primary/10 border-primary/30"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Diagnostics
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const r = routersList.find((x) => x.id === selectedRouterId) || null;
                      setUnregisteredRouter(r);
                      setUnregisteredModalOpen(true);
                    }}
                    className="h-8 text-xs gap-1.5 font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 border-amber-500/30"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Unregistered Secrets
                  </Button>
                </div>
              </div>
            </div>

            {/* Selected Router Quick Telemetry */}
            {routerDetail && (
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <div className="px-3 py-1.5 bg-muted/40 rounded-lg border border-border/40">
                  <span className="text-muted-foreground">Status: </span>
                  <span
                    className={`font-semibold ${
                      routerDetail.router.status === "Online"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-500"
                    }`}
                  >
                    {routerDetail.router.status}
                  </span>
                </div>
                <div className="px-3 py-1.5 bg-muted/40 rounded-lg border border-border/40">
                  <span className="text-muted-foreground">CPU: </span>
                  <span className="font-semibold">{routerDetail.router.cpu_usage ?? 0}%</span>
                </div>
                <div className="px-3 py-1.5 bg-muted/40 rounded-lg border border-border/40">
                  <span className="text-muted-foreground">Memory: </span>
                  <span className="font-semibold">{routerDetail.router.memory_usage ?? 0}%</span>
                </div>
                <div className="px-3 py-1.5 bg-muted/40 rounded-lg border border-border/40">
                  <span className="text-muted-foreground">Uptime: </span>
                  <span className="font-semibold">{routerDetail.router.uptime || "N/A"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Router Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
            <Card className="p-4 shadow-sm bg-muted/10">
              <div className="text-xs text-muted-foreground">Provisioned Customers</div>
              <div className="text-2xl font-bold mt-1 text-foreground">
                {routerDetail?.customer_stats.total_provisioned ?? 0}
              </div>
            </Card>
            <Card className="p-4 shadow-sm bg-emerald-500/5 border-emerald-500/20">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Live PPPoE Sessions</div>
              <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                {routerDetail?.active_sessions_count ?? 0}
              </div>
            </Card>
            <Card className="p-4 shadow-sm bg-muted/10">
              <div className="text-xs text-muted-foreground">Offline Subscribers</div>
              <div className="text-2xl font-bold mt-1 text-muted-foreground">
                {routerDetail?.customer_stats.offline_customers ?? 0}
              </div>
            </Card>
          </div>

          {/* Provisioned Customers on Router Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">Provisioned Subscribers on This Router</CardTitle>
                <CardDescription className="text-xs">
                  Subscriber package binding, live session indicator, and direct operational diagnostics
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search name, code, user..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground font-mono">
                      <th className="pb-2">Code</th>
                      <th className="pb-2">Subscriber</th>
                      <th className="pb-2">PPPoE Username</th>
                      <th className="pb-2">Package</th>
                      <th className="pb-2">Area</th>
                      <th className="pb-2 text-center">Status</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 font-bold text-foreground">{c.customer_code}</td>
                          <td className="py-2.5 font-sans font-medium text-foreground">{c.full_name}</td>
                          <td className="py-2.5 text-primary font-semibold">{c.pppoe_username}</td>
                          <td className="py-2.5 font-sans">
                            {c.package_name} ({c.speed_mbps}M)
                          </td>
                          <td className="py-2.5 text-muted-foreground font-sans">{c.area_zone}</td>
                          <td className="py-2.5 text-center">
                            {c.is_online ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                                Online
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                Offline
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openCustomerDiagnostic(c.id)}
                              className="h-7 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                            >
                              Inspect
                              <ArrowUpRight className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                          No subscribers found on this router.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB: DIAGNOSTIC TOOLS ════════════════════════ */}
      {activeTab === "diagnostics" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Interactive Router Diagnostics</h2>
                <p className="text-xs text-muted-foreground">
                  Dispatch live ICMP Ping and Layer-3 Traceroute probes through any core router in your fleet
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const r = routersList.find((x) => x.id === diagSelectedRouterId) || null;
                  setDiagnosticsRouter(r);
                  setDiagnosticsModalOpen(true);
                }}
                disabled={!diagSelectedRouterId}
                className="text-xs gap-1.5 h-9 font-semibold text-primary hover:bg-primary/10 border-primary/30"
              >
                <Terminal className="w-3.5 h-3.5" />
                Launch Full Modal
              </Button>
            </div>
          </div>

          {/* Diagnostic Probe Config Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Probe Configuration</span>
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 text-xs">
                  <button
                    type="button"
                    onClick={() => setDiagTool("ping")}
                    className={`px-3 py-1 rounded font-medium transition-all ${
                      diagTool === "ping" ? "bg-background text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ICMP Ping
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiagTool("traceroute")}
                    className={`px-3 py-1 rounded font-medium transition-all ${
                      diagTool === "traceroute" ? "bg-background text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Traceroute
                  </button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Executing Router</label>
                  <select
                    value={diagSelectedRouterId}
                    onChange={(e) => setDiagSelectedRouterId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    {routersList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.ip_address}) - {r.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Target Host or IP</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 8.8.8.8, 1.1.1.1, or customer IP"
                      value={diagTarget}
                      onChange={(e) => setDiagTarget(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRunTabDiagnostic()}
                      className="font-mono text-xs h-9 flex-1"
                    />

                    {diagTool === "ping" && (
                      <select
                        value={diagCount}
                        onChange={(e) => setDiagCount(Number(e.target.value))}
                        className="w-28 h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shrink-0"
                      >
                        <option value={4}>4 packets</option>
                        <option value={10}>10 packets</option>
                        <option value={20}>20 packets</option>
                      </select>
                    )}

                    <Button
                      onClick={handleRunTabDiagnostic}
                      disabled={diagRunning || !diagSelectedRouterId || !diagTarget.trim()}
                      className="h-9 text-xs font-semibold gap-1.5 px-4 shrink-0 bg-primary text-primary-foreground"
                    >
                      {diagRunning ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          {diagTool === "ping" ? "Execute Ping" : "Run Traceroute"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-muted-foreground font-medium">Quick Presets:</span>
                {["8.8.8.8", "1.1.1.1", routersList.find((r) => r.id === diagSelectedRouterId)?.ip_address || "192.168.1.1"].map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDiagTarget(preset)}
                      className={`px-2.5 py-1 rounded font-mono text-[11px] border transition-colors ${
                        diagTarget === preset
                          ? "bg-primary/10 border-primary/30 text-primary font-bold"
                          : "bg-muted/40 border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          {/* Error Banner */}
          {diagError && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{diagError}</span>
            </div>
          )}

          {/* Ping Results Panel */}
          {diagTool === "ping" && diagPingResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-4 shadow-sm text-center">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Loss Rate</span>
                  <span
                    className={`text-2xl font-mono font-bold ${
                      (diagPingResult.packet_loss_pct ?? diagPingResult.packet_loss_percent ?? 0) === 0
                        ? "text-emerald-500"
                        : (diagPingResult.packet_loss_pct ?? diagPingResult.packet_loss_percent ?? 0) < 30
                        ? "text-amber-500"
                        : "text-rose-500"
                    }`}
                  >
                    {diagPingResult.packet_loss_pct ?? diagPingResult.packet_loss_percent ?? 0}%
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    {diagPingResult.packets_received ?? diagPingResult.received ?? 0}/
                    {diagPingResult.packets_sent ?? diagPingResult.sent ?? diagCount} packets
                  </span>
                </Card>

                <Card className="p-4 shadow-sm text-center">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Average Latency</span>
                  <span className="text-2xl font-mono font-bold text-foreground">
                    {diagPingResult.avg_rtt_ms ?? diagPingResult.avg_ms ?? "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">milliseconds RTT</span>
                </Card>

                <Card className="p-4 shadow-sm text-center">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Min Latency</span>
                  <span className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {diagPingResult.min_rtt_ms ?? diagPingResult.min_ms ?? "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">best reply</span>
                </Card>

                <Card className="p-4 shadow-sm text-center">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Max Latency</span>
                  <span className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400">
                    {diagPingResult.max_rtt_ms ?? diagPingResult.max_ms ?? "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">jitter peak</span>
                </Card>
              </div>

              {Array.isArray(diagPingResult.results || diagPingResult.raw) && (
                <div className="bg-zinc-950 text-emerald-400 rounded-xl p-4 font-mono text-xs border border-zinc-800 space-y-1.5 shadow-sm">
                  <div className="text-zinc-400 text-[11px] pb-1 border-b border-zinc-900">
                    ICMP Echo Reply Timeline for {diagPingResult.target}
                  </div>
                  {(diagPingResult.results || diagPingResult.raw)?.map((row: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-zinc-300 py-0.5">
                      <span>seq={idx + 1} from {row.host || row.address || diagPingResult.target}</span>
                      <span className="font-bold text-emerald-400">
                        {row.time || (row["avg-rtt"] ? `${row["avg-rtt"]}ms` : "reply ok")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Traceroute Results Panel */}
          {diagTool === "traceroute" && diagTraceResult && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Traceroute Sequence to {diagTraceResult.target}</CardTitle>
                  <CardDescription className="text-xs">Hop-by-hop layer-3 routing path and link latency</CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {diagTraceResult.hops?.length || 0} Hops
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="border border-border/70 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-muted/60 text-muted-foreground border-b border-border/70 font-semibold font-sans">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-16">Hop #</th>
                        <th className="py-2.5 px-3">Gateway Node Address</th>
                        <th className="py-2.5 px-3 text-center w-24">Loss</th>
                        <th className="py-2.5 px-3 text-right w-28">Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {diagTraceResult.hops && diagTraceResult.hops.length > 0 ? (
                        diagTraceResult.hops.map((h, i) => (
                          <tr key={i} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 text-center text-muted-foreground font-bold">{h.hop || i + 1}</td>
                            <td className="py-2 px-3 text-foreground font-semibold flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              {h.address || "*"}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <Badge
                                variant={!h.loss || h.loss === "0%" || h.loss === "0" ? "outline" : "destructive"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {h.loss || "0%"}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                              {h.rtt ? (h.rtt.toString().endsWith("ms") ? h.rtt : `${h.rtt}ms`) : "—"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-muted-foreground font-sans">
                            No hops returned by router.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════════════ TAB 3: OLT → ONUS ════════════════════════ */}
      {activeTab === "olts" && (
        <div className="space-y-6">
          {/* OLT Selection Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
            <div className="flex items-center gap-3">
              <Radio className="w-5 h-5 text-indigo-500 shrink-0" />
              <div>
                <label className="text-xs text-muted-foreground uppercase font-mono">Select GPON / EPON OLT</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <select
                    value={selectedOltId}
                    onChange={(e) => {
                      setSelectedOltId(e.target.value);
                      loadOltDetail(e.target.value);
                    }}
                    className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {oltsList.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.brand}) - {o.ip_address}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadOltDetail(selectedOltId)}
                    disabled={loadingOltDetail}
                    className="h-8 text-xs"
                    title="Refresh OLT Telemetry"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingOltDetail ? "animate-spin" : ""}`} />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const o = oltsList.find((x) => x.id === selectedOltId) || null;
                      setTerminalOlt(o);
                      setTerminalModalOpen(true);
                    }}
                    className="h-8 text-xs gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    CLI Terminal
                  </Button>

                  <Link href="/olt">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 font-semibold text-indigo-400 hover:bg-indigo-500/10 border-indigo-500/30"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      Live Fleet Cockpit
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {oltDetail && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="px-3 py-1.5 bg-muted/40 rounded-lg border border-border/40">
                  <span className="text-muted-foreground">Brand: </span>
                  <span className="font-semibold text-foreground">{oltDetail.olt.brand}</span>
                </div>
                <div className="px-3 py-1.5 bg-muted/40 rounded-lg border border-border/40">
                  <span className="text-muted-foreground">PON Ports: </span>
                  <span className="font-semibold text-foreground">{oltDetail.olt.pon_ports_count}</span>
                </div>
              </div>
            )}
          </div>

          {/* Optical Signal Histogram (Normal, Warning, Critical) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm p-4">
              <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                <span>Normal Signal (&gt;= -24 dBm)</span>
                <CheckCircle className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                {oltDetail?.optical_distribution.normal ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Fiber attenuation within optimal spec</div>
            </Card>

            <Card className="border-amber-500/30 bg-amber-500/5 shadow-sm p-4">
              <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-semibold font-mono">
                <span>Warning Loss (-27 to -24 dBm)</span>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-2">
                {oltDetail?.optical_distribution.warning ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Marginal link loss; check splitter splices</div>
            </Card>

            <Card className="border-rose-500/30 bg-rose-500/5 shadow-sm p-4">
              <div className="flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 font-semibold font-mono">
                <span>Critical / LOS (&lt; -27 dBm)</span>
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-2">
                {oltDetail?.optical_distribution.critical_or_los ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Dying gasp or fiber break detected</div>
            </Card>
          </div>

          {/* Connected ONUs Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">Connected Optical ONUs</CardTitle>
                <CardDescription className="text-xs">
                  Physical port bindings, MAC / Serial identifiers, and calibrated optical power readings
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search customer, port, MAC..."
                    value={onuSearchQuery}
                    onChange={(e) => setOnuSearchQuery(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground font-mono">
                      <th className="pb-2">PON Port</th>
                      <th className="pb-2">Index</th>
                      <th className="pb-2">Subscriber Name</th>
                      <th className="pb-2">MAC / Serial</th>
                      <th className="pb-2 text-right">Rx Power (dBm)</th>
                      <th className="pb-2 text-right">Distance</th>
                      <th className="pb-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {filteredOnus.length > 0 ? (
                      filteredOnus.map((o) => {
                        const rx = parseFloat(o.rx_power);
                        const isAlert = rx < -24.0 || o.status === "DyingGasp" || o.status === "Los";
                        return (
                          <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 font-bold text-foreground">{o.pon_port}</td>
                            <td className="py-2.5 text-muted-foreground">{o.onu_index}</td>
                            <td className="py-2.5 font-sans font-medium text-foreground">{o.customer_name}</td>
                            <td className="py-2.5 text-muted-foreground">{o.serial_number || o.mac_address}</td>
                            <td className="py-2.5 text-right font-bold">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] ${
                                  rx >= -24.0
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : rx >= -27.0
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {o.rx_power} dBm
                              </span>
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">{o.distance_meters}m</td>
                            <td className="py-2.5 text-center">
                              <Badge
                                variant={isAlert ? "destructive" : "outline"}
                                className={`text-[10px] ${!isAlert ? "text-emerald-600 border-emerald-500/30" : ""}`}
                              >
                                {o.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                          No ONUs found on this OLT.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB: WIREGUARD VPN ════════════════════════ */}
      {activeTab === "vpn" && (
        <div className="space-y-6">
          <WireGuardPanel routers={routersList} olts={oltsList} />
        </div>
      )}

      {/* ════════════════════════ TAB: FIBER TOPOLOGY & GIS ════════════════════════ */}
      {activeTab === "topology" && (
        <div className="space-y-6">
          {/* Executive Topology Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <GitFork className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Fiber Network Topology & GIS Infrastructure</h2>
                <p className="text-xs text-muted-foreground">
                  Authoritative 4-tier network path hierarchy from Core BNG routers to subscriber ONUs
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMapBoxes}
                disabled={loadingMapBoxes}
                className="text-xs gap-1.5 h-9 font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30"
              >
                <Compass className={`w-3.5 h-3.5 ${loadingMapBoxes ? "animate-spin" : ""}`} />
                {loadingMapBoxes ? "Loading Map..." : "Open Fiber GIS Map"}
              </Button>

              <Link href="/topology">
                <Button size="sm" className="text-xs gap-1.5 h-9 font-semibold bg-primary text-primary-foreground">
                  <Layers className="w-3.5 h-3.5" />
                  Full Hierarchy Drilldown
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Topology Tier Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <Card className="p-4 shadow-sm bg-card hover:border-primary/40 transition-all">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs uppercase font-mono font-semibold">Tier 1: BNG Routers</span>
                <Server className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold font-mono text-foreground mt-2">{routersList.length}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Core routing & PPPoE NAS</div>
            </Card>

            <Card className="p-4 shadow-sm bg-card hover:border-primary/40 transition-all">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs uppercase font-mono font-semibold">Tier 2: OLT Frames</span>
                <Radio className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-foreground mt-2">{oltsList.length}</div>
              <div className="text-[11px] text-muted-foreground mt-1">EPON / GPON Optical Line Terminals</div>
            </Card>

            <Card className="p-4 shadow-sm bg-card hover:border-primary/40 transition-all">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs uppercase font-mono font-semibold">Tier 3: Distribution</span>
                <Layers className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-foreground mt-2">
                {cockpitData?.area_breakdown.length ?? 0} Zones
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Master & Splitter TJ Boxes</div>
            </Card>

            <Card className="p-4 shadow-sm bg-card hover:border-primary/40 transition-all">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs uppercase font-mono font-semibold">Tier 4: Access ONUs</span>
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-foreground mt-2">
                {cockpitData?.customers.online ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Active subscriber terminals</div>
            </Card>
          </div>

          {/* Visual Architecture Flow Diagram */}
          <Card className="p-6 shadow-sm border border-border/70">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                End-to-End Carrier Delivery Pipeline
              </CardTitle>
              <CardDescription className="text-xs">
                Physical optical fiber and layer-3 forwarding architecture
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2 text-center text-xs">
                <div className="p-4 rounded-xl bg-muted/40 border border-border/70 space-y-2">
                  <Globe className="w-6 h-6 text-primary mx-auto" />
                  <div className="font-bold text-foreground">Upstream Transit</div>
                  <div className="text-[11px] text-muted-foreground font-mono">BGP / IXP Feeds</div>
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                  <Server className="w-6 h-6 text-primary mx-auto" />
                  <div className="font-bold text-foreground">BNG MikroTik</div>
                  <div className="text-[11px] text-muted-foreground font-mono">PPPoE & Rate Shaping</div>
                </div>
                <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-2">
                  <Radio className="w-6 h-6 text-indigo-500 mx-auto" />
                  <div className="font-bold text-foreground">EPON / GPON OLT</div>
                  <div className="text-[11px] text-muted-foreground font-mono">PON Line Cards</div>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                  <Layers className="w-6 h-6 text-amber-500 mx-auto" />
                  <div className="font-bold text-foreground">TJ Enclosures</div>
                  <div className="text-[11px] text-muted-foreground font-mono">Splitters 1:8 / 1:16</div>
                </div>
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <Users className="w-6 h-6 text-emerald-500 mx-auto" />
                  <div className="font-bold text-foreground">Subscriber ONUs</div>
                  <div className="text-[11px] text-muted-foreground font-mono">Optical Rx Power</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB 4: CUSTOMER → SERVICE ════════════════════════ */}
      {activeTab === "customer" && (
        <div className="space-y-6">
          {/* Customer Search Bar */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Subscriber Network Diagnostics Search</CardTitle>
              <CardDescription className="text-xs">
                Inspect live PPPoE credentials, MikroTik active sessions, and linked fiber ONU optics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    placeholder="Enter subscriber Customer Code or PPPoE Username..."
                    value={activeCustomerCode}
                    onChange={(e) => setActiveCustomerCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && activeCustomerCode.trim()) {
                        // Find customer id from routers list or open diagnostic
                        const matched = routerDetail?.customers.find(
                          (c) =>
                            c.customer_code.toLowerCase() === activeCustomerCode.trim().toLowerCase() ||
                            c.pppoe_username.toLowerCase() === activeCustomerCode.trim().toLowerCase()
                        );
                        if (matched) {
                          openCustomerDiagnostic(matched.id);
                        }
                      }
                    }}
                    className="pl-9 text-sm"
                  />
                </div>
                <Button
                  onClick={() => {
                    const matched = routerDetail?.customers.find(
                      (c) =>
                        c.customer_code.toLowerCase() === activeCustomerCode.trim().toLowerCase() ||
                        c.pppoe_username.toLowerCase() === activeCustomerCode.trim().toLowerCase()
                    );
                    if (matched) {
                      openCustomerDiagnostic(matched.id);
                    }
                  }}
                  className="gap-2"
                >
                  <Search className="w-4 h-4" />
                  Diagnose
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Fast Picker from Loaded Router */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase font-mono">
                Subscribers On Current Router ({routerDetail?.router.name || "Default Core"})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {routerDetail?.customers && routerDetail.customers.length > 0 ? (
                  routerDetail.customers.slice(0, 8).map((c) => (
                    <div
                      key={c.id}
                      onClick={() => openCustomerDiagnostic(c.id)}
                      className="p-3 rounded-lg border border-border/60 hover:border-primary/60 bg-card hover:bg-muted/30 transition-all cursor-pointer space-y-1.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-foreground">{c.customer_code}</span>
                        {c.is_online ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-muted-foreground/40"></span>
                        )}
                      </div>
                      <div className="font-medium text-xs text-foreground truncate">{c.full_name}</div>
                      <div className="text-[11px] font-mono text-primary truncate">{c.pppoe_username}</div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-4 text-center py-6 text-xs text-muted-foreground">
                    Load a router from the "Router → Customers" tab to inspect subscribers.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB 5: PPPOE RECONCILIATION ════════════════════════ */}
      {activeTab === "reconciliation" && (
        <div className="space-y-6">
          {/* Header & Trigger Control */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
            <div className="flex items-center gap-3">
              <Sliders className="w-5 h-5 text-primary shrink-0" />
              <div>
                <label className="text-xs text-muted-foreground uppercase font-mono">Target Core Router</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <select
                    value={selectedRouterId}
                    onChange={(e) => {
                      setSelectedRouterId(e.target.value);
                    }}
                    className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {routersList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.ip_address}) - {r.status}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={handleTriggerReconciliation}
                    disabled={reconcilingRouterId !== null || !selectedRouterId}
                    className="h-8 text-xs gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reconcilingRouterId ? "animate-spin" : ""}`} />
                    {reconcilingRouterId ? "Reconciling Device..." : "Run Full Reconciliation"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick stats for current selection */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {reconciliationRuns.length > 0 && reconciliationRuns[0].completed_at
                  ? `Last audit: ${new Date(reconciliationRuns[0].completed_at).toLocaleTimeString()}`
                  : "Audit ready"}
              </span>
            </div>
          </div>

          {/* Feedback Banner */}
          {safeSyncFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between gap-2 ${
                safeSyncFeedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                  : "bg-destructive/10 text-destructive border border-destructive/30"
              }`}
            >
              <div className="flex items-center gap-2">
                {safeSyncFeedback.type === "success" ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{safeSyncFeedback.text}</span>
              </div>
              <button
                onClick={() => setSafeSyncFeedback(null)}
                className="text-xs hover:opacity-70"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Reconciliation Metric Counters Deck */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <Card
              onClick={() => setReconciliationStatusFilter("ALL")}
              className={`cursor-pointer transition-all p-3 shadow-sm hover:border-primary/40 ${
                reconciliationStatusFilter === "ALL" ? "border-primary bg-primary/5" : "bg-card"
              }`}
            >
              <div className="text-[11px] font-semibold text-muted-foreground uppercase font-mono">Total Secrets</div>
              <div className="text-xl font-bold font-mono mt-1 text-foreground">
                {reconciliationSecrets.length}
              </div>
            </Card>

            <Card
              onClick={() => setReconciliationStatusFilter("MATCHED")}
              className={`cursor-pointer transition-all p-3 shadow-sm hover:border-emerald-500/40 ${
                reconciliationStatusFilter === "MATCHED" ? "border-emerald-500 bg-emerald-500/5" : "bg-card"
              }`}
            >
              <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase font-mono">Matched</div>
              <div className="text-xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
                {reconciliationSecrets.filter((s) => s.reconciliation_status === "MATCHED").length}
              </div>
            </Card>

            <Card
              onClick={() => setReconciliationStatusFilter("PROFILE_MISMATCH")}
              className={`cursor-pointer transition-all p-3 shadow-sm hover:border-amber-500/40 ${
                reconciliationStatusFilter === "PROFILE_MISMATCH" ? "border-amber-500 bg-amber-500/5" : "bg-card"
              }`}
            >
              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase font-mono">Profile Diff</div>
              <div className="text-xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
                {reconciliationSecrets.filter((s) => s.reconciliation_status === "PROFILE_MISMATCH").length}
              </div>
            </Card>

            <Card
              onClick={() => setReconciliationStatusFilter("STATUS_MISMATCH")}
              className={`cursor-pointer transition-all p-3 shadow-sm hover:border-amber-500/40 ${
                reconciliationStatusFilter === "STATUS_MISMATCH" ? "border-amber-500 bg-amber-500/5" : "bg-card"
              }`}
            >
              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase font-mono">Status Diff</div>
              <div className="text-xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
                {reconciliationSecrets.filter((s) => s.reconciliation_status === "STATUS_MISMATCH").length}
              </div>
            </Card>

            <Card
              onClick={() => setReconciliationStatusFilter("MISSING_IN_ROUTER")}
              className={`cursor-pointer transition-all p-3 shadow-sm hover:border-rose-500/40 ${
                reconciliationStatusFilter === "MISSING_IN_ROUTER" ? "border-rose-500 bg-rose-500/5" : "bg-card"
              }`}
            >
              <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase font-mono">Missing</div>
              <div className="text-xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400">
                {reconciliationSecrets.filter((s) => s.reconciliation_status === "MISSING_IN_ROUTER").length}
              </div>
            </Card>

            <Card
              onClick={() => setReconciliationStatusFilter("UNKNOWN_IN_ERP")}
              className={`cursor-pointer transition-all p-3 shadow-sm hover:border-purple-500/40 ${
                reconciliationStatusFilter === "UNKNOWN_IN_ERP" ? "border-purple-500 bg-purple-500/5" : "bg-card"
              }`}
            >
              <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase font-mono">Orphans</div>
              <div className="text-xl font-bold font-mono mt-1 text-purple-600 dark:text-purple-400">
                {reconciliationSecrets.filter((s) => s.reconciliation_status === "UNKNOWN_IN_ERP").length}
              </div>
            </Card>

            <Card
              onClick={() => setReconciliationStatusFilter("ROUTER_MISMATCH")}
              className={`cursor-pointer transition-all p-3 shadow-sm hover:border-blue-500/40 ${
                reconciliationStatusFilter === "ROUTER_MISMATCH" ? "border-blue-500 bg-blue-500/5" : "bg-card"
              }`}
            >
              <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase font-mono">Wrong Router</div>
              <div className="text-xl font-bold font-mono mt-1 text-blue-600 dark:text-blue-400">
                {reconciliationSecrets.filter((s) => s.reconciliation_status === "ROUTER_MISMATCH").length}
              </div>
            </Card>
          </div>

          {/* Secret Inventory Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">Discovered PPPoE Secret Inventory & Audit State</CardTitle>
                <CardDescription className="text-xs">
                  Exact mapping between ERP subscriber records and actual RouterOS /ppp/secret table
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-48 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search username, subscriber..."
                    value={reconciliationSearch}
                    onChange={(e) => setReconciliationSearch(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadReconciliation}
                  disabled={loadingReconciliation}
                  className="h-8 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingReconciliation ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground font-mono">
                      <th className="pb-2">Username</th>
                      <th className="pb-2">ERP Subscriber</th>
                      <th className="pb-2">Router</th>
                      <th className="pb-2">Profile (Actual / Expected)</th>
                      <th className="pb-2 text-center">Status</th>
                      <th className="pb-2 text-center">Audit Result</th>
                      <th className="pb-2 text-right">Interventions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {reconciliationSecrets.length > 0 ? (
                      reconciliationSecrets.map((item) => {
                        const st = item.reconciliation_status;
                        return (
                          <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 font-bold text-foreground">
                              {item.username}
                            </td>
                            <td className="py-2.5 font-sans">
                              {item.customer_name ? (
                                <div>
                                  <div className="font-medium text-foreground">{item.customer_name}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{item.customer_code}</div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">None (Orphan)</span>
                              )}
                            </td>
                            <td className="py-2.5 text-muted-foreground">{item.router_name}</td>
                            <td className="py-2.5">
                              <span className="font-semibold text-foreground">
                                {item.router_profile || "Missing"}
                              </span>
                              {item.expected_profile && item.router_profile !== item.expected_profile && (
                                <span className="text-rose-500 ml-1.5 font-semibold">
                                  &rarr; {item.expected_profile}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 text-center">
                              {item.router_disabled === true && (
                                <Badge variant="destructive" className="text-[10px]">
                                  Disabled
                                </Badge>
                              )}
                              {item.router_disabled === false && (
                                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                                  Enabled
                                </Badge>
                              )}
                              {item.router_disabled === null && (
                                <span className="text-muted-foreground text-[10px]">N/A</span>
                              )}
                            </td>
                            <td className="py-2.5 text-center">
                              {st === "MATCHED" && (
                                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                                  MATCHED
                                </Badge>
                              )}
                              {st === "PROFILE_MISMATCH" && (
                                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                                  PROFILE DIFF
                                </Badge>
                              )}
                              {st === "STATUS_MISMATCH" && (
                                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                                  STATUS DIFF
                                </Badge>
                              )}
                              {st === "MISSING_IN_ROUTER" && (
                                <Badge variant="destructive" className="text-[10px]">
                                  MISSING IN ROUTER
                                </Badge>
                              )}
                              {st === "UNKNOWN_IN_ERP" && (
                                <Badge variant="destructive" className="text-[10px] bg-purple-500/15 text-purple-600 border-purple-500/30">
                                  ORPHAN SECRET
                                </Badge>
                              )}
                              {st === "ROUTER_MISMATCH" && (
                                <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-500/30">
                                  WRONG ROUTER
                                </Badge>
                              )}
                              {st === "ERROR" && (
                                <Badge variant="destructive" className="text-[10px]">
                                  ERROR
                                </Badge>
                              )}
                            </td>
                            <td className="py-2.5 text-right space-x-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedSecretForDetail(item)}
                                className="h-7 text-xs"
                              >
                                Diff
                              </Button>

                              {st === "MISSING_IN_ROUTER" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSafeSync(item, "PUSH_TO_ROUTER")}
                                  disabled={safeSyncLoading === item.id}
                                  className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
                                >
                                  {safeSyncLoading === item.id ? "Pushing..." : "Push to Router"}
                                </Button>
                              )}

                              {st === "PROFILE_MISMATCH" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSafeSync(item, "SYNC_PROFILE")}
                                  disabled={safeSyncLoading === item.id}
                                  className="h-7 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                >
                                  {safeSyncLoading === item.id ? "Syncing..." : "Sync Profile"}
                                </Button>
                              )}

                              {st === "STATUS_MISMATCH" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSafeSync(item, "SYNC_STATUS")}
                                  disabled={safeSyncLoading === item.id}
                                  className="h-7 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                >
                                  {safeSyncLoading === item.id ? "Syncing..." : "Sync Status"}
                                </Button>
                              )}

                              {st === "UNKNOWN_IN_ERP" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSafeSync(item, "DISABLE_ORPHAN")}
                                  disabled={safeSyncLoading === item.id}
                                  className="h-7 text-xs border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
                                >
                                  {safeSyncLoading === item.id ? "Disabling..." : "Disable Orphan"}
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                          {loadingReconciliation
                            ? "Loading secret inventory..."
                            : "No secrets match the selected filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB 6: NETWORK ACTION QUEUE & BULK OPERATIONS ════════════════════════ */}
      {activeTab === "actions" && (
        <div className="space-y-6">
          {/* Header & Bulk Launch Control */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
            <div className="flex items-center gap-3">
              <ListOrdered className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h2 className="text-base font-bold text-foreground">Carrier Network Action Queue & Bulk Operations</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Durable, asynchronous first-class jobs with idempotency, retry safety, and distributed locking.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadNetworkActions();
                  loadBulkBatches();
                }}
                disabled={loadingActions}
                className="gap-1.5 text-xs font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingActions ? "animate-spin" : ""}`} />
                Refresh Queue
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  setBulkStep(1);
                  setBulkModalOpen(true);
                }}
                className="gap-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                Launch Bulk Operation
              </Button>
            </div>
          </div>

          {/* KPI Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <Card className="bg-card p-3 rounded-lg border border-border/60 text-center">
              <div className="text-xs text-muted-foreground font-mono">Total</div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">{actionsList.length}</div>
            </Card>
            <Card className="bg-card p-3 rounded-lg border border-border/60 text-center">
              <div className="text-xs text-cyan-600 dark:text-cyan-400 font-mono font-semibold">Pending</div>
              <div className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
                {actionsList.filter((a) => a.status === "PENDING").length}
              </div>
            </Card>
            <Card className="bg-card p-3 rounded-lg border border-border/60 text-center">
              <div className="text-xs text-amber-600 dark:text-amber-400 font-mono font-semibold">Processing</div>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {actionsList.filter((a) => a.status === "PROCESSING").length}
              </div>
            </Card>
            <Card className="bg-card p-3 rounded-lg border border-border/60 text-center">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-mono font-semibold">Success</div>
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {actionsList.filter((a) => a.status === "SUCCESS").length}
              </div>
            </Card>
            <Card className="bg-card p-3 rounded-lg border border-border/60 text-center">
              <div className="text-xs text-rose-600 dark:text-rose-400 font-mono font-semibold">Failed</div>
              <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                {actionsList.filter((a) => a.status === "FAILED").length}
              </div>
            </Card>
            <Card className="bg-card p-3 rounded-lg border border-border/60 text-center">
              <div className="text-xs text-purple-600 dark:text-purple-400 font-mono font-semibold">Retrying</div>
              <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-1">
                {actionsList.filter((a) => a.status === "RETRYING").length}
              </div>
            </Card>
            <Card className="bg-card p-3 rounded-lg border border-border/60 text-center">
              <div className="text-xs text-muted-foreground font-mono">Cancelled</div>
              <div className="text-xl font-bold font-mono text-muted-foreground mt-1">
                {actionsList.filter((a) => a.status === "CANCELLED").length}
              </div>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by customer name, username, or code..."
                    value={actionSearchQuery}
                    onChange={(e) => setActionSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-muted-foreground">Status:</span>
                  <select
                    value={actionStatusFilter}
                    onChange={(e) => setActionStatusFilter(e.target.value)}
                    className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="SUCCESS">Success</option>
                    <option value="FAILED">Failed</option>
                    <option value="RETRYING">Retrying</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                {/* Action Type Filter */}
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-muted-foreground">Action:</span>
                  <select
                    value={actionTypeFilter}
                    onChange={(e) => setActionTypeFilter(e.target.value)}
                    className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Actions</option>
                    <option value="ENABLE_SERVICE">Enable Service</option>
                    <option value="DISABLE_SERVICE">Disable Service</option>
                    <option value="RECONNECT">Reconnect / Drop</option>
                    <option value="CHANGE_PACKAGE">Change Package</option>
                    <option value="SYNC_SECRET">Sync Secret</option>
                    <option value="SYNC_PROFILE">Sync Profile</option>
                    <option value="SYNC_ROUTER">Sync Router</option>
                    <option value="RETRY_FAILED">Retry Failed</option>
                  </select>
                </div>

                {/* Router Filter */}
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-muted-foreground">Router:</span>
                  <select
                    value={actionRouterFilter}
                    onChange={(e) => setActionRouterFilter(e.target.value)}
                    className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Routers</option>
                    {routersList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Queue Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Active Action Queue</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {actionsList.length} total operations
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 font-mono text-muted-foreground text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-3">Action</th>
                      <th className="py-3 px-3">Router</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Attempt</th>
                      <th className="py-3 px-3">Last Error</th>
                      <th className="py-3 px-3">Timestamps</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {actionsList.length > 0 ? (
                      actionsList.map((item) => {
                        const isPending = item.status === "PENDING";
                        const isProcessing = item.status === "PROCESSING";
                        const isSuccess = item.status === "SUCCESS";
                        const isFailed = item.status === "FAILED";
                        const isRetrying = item.status === "RETRYING";

                        let badgeColor = "bg-muted text-muted-foreground";
                        if (isPending) badgeColor = "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
                        else if (isProcessing) badgeColor = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
                        else if (isSuccess) badgeColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
                        else if (isFailed) badgeColor = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
                        else if (isRetrying) badgeColor = "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";

                        return (
                          <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-sans font-semibold text-foreground">{item.customer_name}</div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span className="text-primary font-mono">{item.pppoe_username || "—"}</span>
                                {item.customer_code && (
                                  <span className="text-[10px] text-muted-foreground">({item.customer_code})</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="font-mono text-[10px] font-semibold">
                                {item.action_display || item.action}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 font-medium text-foreground">
                              {item.router_name || "Unassigned"}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeColor}`}>
                                {isProcessing && <RefreshCw className="w-3 h-3 animate-spin" />}
                                {isSuccess && <CheckCircle2 className="w-3 h-3" />}
                                {isFailed && <XCircle className="w-3 h-3" />}
                                {isRetrying && <RotateCcw className="w-3 h-3" />}
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-mono font-bold">
                                {item.attempt_count} / {item.max_retries}
                              </span>
                            </td>
                            <td className="py-3 px-3 max-w-[220px]">
                              {item.last_error ? (
                                <span className="text-rose-600 dark:text-rose-400 text-[11px] truncate block" title={item.last_error}>
                                  {item.last_error}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-[11px] text-muted-foreground">
                              <div>Created: {new Date(item.created_at).toLocaleTimeString()}</div>
                              {item.completed_at && (
                                <div className="text-emerald-600 dark:text-emerald-400">
                                  Done: {new Date(item.completed_at).toLocaleTimeString()}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {(isFailed || isRetrying) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRetryAction(item.id)}
                                    disabled={actionItemLoading === item.id}
                                    className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1"
                                  >
                                    <RotateCcw className={`w-3 h-3 ${actionItemLoading === item.id ? "animate-spin" : ""}`} />
                                    Retry
                                  </Button>
                                )}
                                {isPending && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCancelAction(item.id)}
                                    disabled={actionItemLoading === item.id}
                                    className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                  >
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-muted-foreground">
                          {loadingActions ? "Loading action queue..." : "No actions match the selected filter criteria."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ DISCREPANCY COMPARISON MODAL ════════════════════════ */}
      {selectedSecretForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/60 flex items-center justify-between bg-card">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>Reconciliation Diff: {selectedSecretForDetail.username}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedSecretForDetail.reconciliation_status}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Router: {selectedSecretForDetail.router_name} ({selectedSecretForDetail.router_ip})
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSecretForDetail(null)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* ERP Record */}
                <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary font-mono">
                    ERP Authoritative Record
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground">Subscriber: </span>
                      <span className="font-semibold text-foreground">
                        {selectedSecretForDetail.customer_name || "N/A (No ERP link)"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Code: </span>
                      <span className="font-semibold text-foreground">
                        {selectedSecretForDetail.customer_code || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status: </span>
                      <span className="font-semibold text-foreground">
                        {selectedSecretForDetail.customer_status || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expected Profile: </span>
                      <span className="font-semibold text-foreground">
                        {selectedSecretForDetail.expected_profile || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expected Disabled: </span>
                      <span className="font-semibold text-foreground">
                        {String(selectedSecretForDetail.expected_disabled)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actual MikroTik Router State */}
                <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-500 font-mono">
                    MikroTik Actual Device State
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground">Secret Name: </span>
                      <span className="font-semibold text-foreground">{selectedSecretForDetail.username}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Router Profile: </span>
                      <span
                        className={`font-semibold ${
                          selectedSecretForDetail.router_profile !== selectedSecretForDetail.expected_profile
                            ? "text-rose-500 font-bold"
                            : "text-foreground"
                        }`}
                      >
                        {selectedSecretForDetail.router_profile || "Not present"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Disabled Flag: </span>
                      <span
                        className={`font-semibold ${
                          selectedSecretForDetail.router_disabled !== selectedSecretForDetail.expected_disabled
                            ? "text-rose-500 font-bold"
                            : "text-foreground"
                        }`}
                      >
                        {String(selectedSecretForDetail.router_disabled)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Router Comment: </span>
                      <span className="text-foreground truncate">{selectedSecretForDetail.router_comment || "None"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Service: </span>
                      <span className="text-foreground">{selectedSecretForDetail.router_service || "pppoe"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Discrepancy details */}
              {selectedSecretForDetail.discrepancy_details && (
                <div className="p-3 bg-muted/30 rounded-lg border border-border/40 text-xs font-mono">
                  <span className="text-muted-foreground">Diagnosis: </span>
                  <span className="font-semibold text-foreground">
                    {JSON.stringify(selectedSecretForDetail.discrepancy_details)}
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border/60 flex items-center justify-between bg-card">
              <Button variant="outline" size="sm" onClick={() => setSelectedSecretForDetail(null)}>
                Close
              </Button>

              <div className="flex items-center gap-2">
                {selectedSecretForDetail.reconciliation_status === "MISSING_IN_ROUTER" && (
                  <Button
                    size="sm"
                    onClick={() => handleSafeSync(selectedSecretForDetail, "PUSH_TO_ROUTER")}
                    disabled={safeSyncLoading === selectedSecretForDetail.id}
                    className="text-xs"
                  >
                    {safeSyncLoading === selectedSecretForDetail.id ? "Pushing..." : "Push to Router"}
                  </Button>
                )}
                {selectedSecretForDetail.reconciliation_status === "PROFILE_MISMATCH" && (
                  <Button
                    size="sm"
                    onClick={() => handleSafeSync(selectedSecretForDetail, "SYNC_PROFILE")}
                    disabled={safeSyncLoading === selectedSecretForDetail.id}
                    className="text-xs"
                  >
                    {safeSyncLoading === selectedSecretForDetail.id ? "Syncing..." : "Sync Profile to Match ERP"}
                  </Button>
                )}
                {selectedSecretForDetail.reconciliation_status === "STATUS_MISMATCH" && (
                  <Button
                    size="sm"
                    onClick={() => handleSafeSync(selectedSecretForDetail, "SYNC_STATUS")}
                    disabled={safeSyncLoading === selectedSecretForDetail.id}
                    className="text-xs"
                  >
                    {safeSyncLoading === selectedSecretForDetail.id ? "Syncing..." : "Sync Status to Match ERP"}
                  </Button>
                )}
                {selectedSecretForDetail.reconciliation_status === "UNKNOWN_IN_ERP" && (
                  <Button
                    size="sm"
                    onClick={() => handleSafeSync(selectedSecretForDetail, "DISABLE_ORPHAN")}
                    disabled={safeSyncLoading === selectedSecretForDetail.id}
                    className="text-xs"
                  >
                    {safeSyncLoading === selectedSecretForDetail.id ? "Disabling..." : "Disable Orphan on Router"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ SUBSCRIBER NETWORK STATUS PANEL MODAL ════════════════════════ */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-border/60 flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur z-10">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">
                    {activeCustomerStatus?.customer.full_name || "Subscriber Diagnostics"}
                  </h3>
                  {activeCustomerStatus?.session.is_online ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                      Online
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">
                      Offline
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Code: {activeCustomerStatus?.customer.customer_code} | User:{" "}
                  {activeCustomerStatus?.customer.pppoe_username}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomerModalOpen(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Action Feedback Banner */}
            {actionMessage && (
              <div
                className={`p-3 mx-5 mt-4 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  actionMessage.type === "success"
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                    : "bg-destructive/10 text-destructive border border-destructive/30"
                }`}
              >
                {actionMessage.type === "success" ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{actionMessage.text}</span>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-5 space-y-6 flex-1">
              {loadingCustomerStatus ? (
                <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                  <span>Querying MikroTik BNG and OLT telemetry...</span>
                </div>
              ) : activeCustomerStatus ? (
                <>
                  {/* Operator Actions Bar */}
                  <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                      Operator Interventions
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => executeOperatorAction("disconnect")}
                        disabled={actionLoading !== null}
                        className="text-xs gap-1.5 h-8"
                      >
                        <Power className="w-3.5 h-3.5" />
                        {actionLoading === "disconnect" ? "Disconnecting..." : "Disconnect Session"}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => executeOperatorAction("sync_profile")}
                        disabled={actionLoading !== null}
                        className="text-xs gap-1.5 h-8"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${actionLoading === "sync_profile" ? "animate-spin" : ""}`}
                        />
                        {actionLoading === "sync_profile" ? "Syncing..." : "Sync Speed Profile"}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => executeOperatorAction("reboot_onu")}
                        disabled={actionLoading !== null || !activeCustomerStatus.onu}
                        className="text-xs gap-1.5 h-8 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        {actionLoading === "reboot_onu" ? "Dispatching..." : "Reboot ONU Optical Unit"}
                      </Button>
                    </div>
                  </div>

                  {/* 1. Live Session Status (MikroTik) */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-primary" /> Live Router BNG Session
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="p-3 bg-card rounded-lg border border-border/60">
                        <div className="text-muted-foreground text-[10px]">Session IP</div>
                        <div className="font-bold text-foreground mt-0.5">
                          {activeCustomerStatus.session.ip_address || "N/A"}
                        </div>
                      </div>
                      <div className="p-3 bg-card rounded-lg border border-border/60">
                        <div className="text-muted-foreground text-[10px]">MAC Address</div>
                        <div className="font-bold text-foreground mt-0.5 truncate">
                          {activeCustomerStatus.session.mac_address || "N/A"}
                        </div>
                      </div>
                      <div className="p-3 bg-card rounded-lg border border-border/60">
                        <div className="text-muted-foreground text-[10px]">Uptime</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {activeCustomerStatus.session.uptime || "0s"}
                        </div>
                      </div>
                      <div className="p-3 bg-card rounded-lg border border-border/60">
                        <div className="text-muted-foreground text-[10px]">Assigned Router</div>
                        <div className="font-bold text-foreground mt-0.5 truncate">
                          {activeCustomerStatus.router?.name || "Unassigned"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Fiber Optical Telemetry (OLT / ONU) */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-indigo-500" /> Optical Link & Fiber Diagnostics
                    </div>
                    {activeCustomerStatus.onu ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                        <div className="p-3 bg-card rounded-lg border border-border/60">
                          <div className="text-muted-foreground text-[10px]">Rx Optical Power</div>
                          <div className="font-bold text-foreground mt-0.5">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                parseFloat(activeCustomerStatus.onu.rx_power) >= -24.0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-500"
                              }`}
                            >
                              {activeCustomerStatus.onu.rx_power} dBm
                            </span>
                          </div>
                        </div>
                        <div className="p-3 bg-card rounded-lg border border-border/60">
                          <div className="text-muted-foreground text-[10px]">Fiber Distance</div>
                          <div className="font-bold text-foreground mt-0.5">
                            {activeCustomerStatus.onu.distance_meters} meters
                          </div>
                        </div>
                        <div className="p-3 bg-card rounded-lg border border-border/60">
                          <div className="text-muted-foreground text-[10px]">PON Port / Index</div>
                          <div className="font-bold text-foreground mt-0.5">
                            {activeCustomerStatus.onu.pon_port} : {activeCustomerStatus.onu.onu_index}
                          </div>
                        </div>
                        <div className="p-3 bg-card rounded-lg border border-border/60">
                          <div className="text-muted-foreground text-[10px]">OLT Device</div>
                          <div className="font-bold text-foreground mt-0.5 truncate">
                            {activeCustomerStatus.onu.olt_name}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-muted/20 border border-dashed border-border text-center text-xs text-muted-foreground">
                        No optical ONU currently assigned to this subscriber.
                      </div>
                    )}
                  </div>

                  {/* 3. Sync Jobs History */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Recent Synchronization Jobs
                    </div>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {activeCustomerStatus.recent_jobs && activeCustomerStatus.recent_jobs.length > 0 ? (
                        activeCustomerStatus.recent_jobs.map((j) => (
                          <div
                            key={j.id}
                            className="p-2.5 rounded-lg border border-border/50 bg-muted/10 flex items-center justify-between text-xs font-mono"
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={j.status === "SUCCESS" ? "default" : "destructive"}
                                className="text-[10px]"
                              >
                                {j.status}
                              </Badge>
                              <span className="font-semibold text-foreground">{j.action}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(j.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground py-2">No sync jobs on record.</div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border/60 flex justify-end bg-card">
              <Button variant="outline" size="sm" onClick={() => setCustomerModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ BULK OPERATIONS WIZARD MODAL ════════════════════════ */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-border/60 flex items-center justify-between bg-card">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Play className="w-4 h-4 text-primary" />
                  <span>Bulk Network Operations Wizard</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    Step {bulkStep} of 4
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select, validate, preview, and durably queue bulk device operations.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setBulkModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Step 1: Select Action & Scope */}
              {bulkStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground font-mono">Action Type</label>
                    <select
                      value={bulkActionType}
                      onChange={(e) => setBulkActionType(e.target.value)}
                      className="w-full mt-1 bg-background border border-border rounded-lg p-2.5 text-sm font-semibold focus:ring-1 focus:ring-primary"
                    >
                      <option value="DISABLE_SERVICE">Disable Service / Cut Internet</option>
                      <option value="ENABLE_SERVICE">Enable Service / Uncut Internet</option>
                      <option value="RECONNECT">Reconnect Active Sessions</option>
                      <option value="CHANGE_PACKAGE">Change Package & Bandwidth Profile</option>
                      <option value="SYNC_SECRET">Synchronize PPPoE Secrets</option>
                      <option value="SYNC_PROFILE">Synchronize MikroTik Profiles</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold uppercase text-muted-foreground font-mono">Target Core Router</label>
                      <select
                        value={bulkRouterId}
                        onChange={(e) => setBulkRouterId(e.target.value)}
                        className="w-full mt-1 bg-background border border-border rounded-lg p-2.5 text-sm font-semibold focus:ring-1 focus:ring-primary"
                      >
                        <option value="">All Routers</option>
                        {routersList.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.ip_address})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase text-muted-foreground font-mono">Subscriber Billing Status</label>
                      <select
                        value={bulkStatusFilter}
                        onChange={(e) => setBulkStatusFilter(e.target.value)}
                        className="w-full mt-1 bg-background border border-border rounded-lg p-2.5 text-sm font-semibold focus:ring-1 focus:ring-primary"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Expired">Expired</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>
                  </div>

                  {bulkActionType === "CHANGE_PACKAGE" && (
                    <div>
                      <label className="text-xs font-semibold uppercase text-muted-foreground font-mono">Target Destination Package</label>
                      <select
                        value={bulkPackageId}
                        onChange={(e) => setBulkPackageId(e.target.value)}
                        className="w-full mt-1 bg-background border border-border rounded-lg p-2.5 text-sm font-semibold focus:ring-1 focus:ring-primary"
                      >
                        <option value="">Select Target Package...</option>
                        {packagesList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.speed_mbps} Mbps, profile: {p.mikrotik_profile})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="p-3.5 bg-muted/20 border border-border/60 rounded-lg text-xs text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>
                      Step 1 evaluates database candidate records. The next step will run pre-execution validation to filter eligible vs skipped subscribers.
                    </span>
                  </div>
                </div>
              )}

              {/* Step 2: Validate & Preview */}
              {bulkStep === 2 && bulkPreview && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 font-mono text-center">
                    <div className="p-3 bg-card border border-border rounded-lg">
                      <div className="text-xs text-muted-foreground">Total Evaluated</div>
                      <div className="text-xl font-bold mt-1">{bulkPreview.total_count}</div>
                    </div>
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                      <div className="text-xs">Eligible for Action</div>
                      <div className="text-xl font-bold mt-1">{bulkPreview.eligible_count}</div>
                    </div>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400">
                      <div className="text-xs">Skipped / Excluded</div>
                      <div className="text-xl font-bold mt-1">{bulkPreview.skipped_count}</div>
                    </div>
                  </div>

                  {bulkPreview.skipped_targets.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-muted-foreground font-mono">
                        Skipped Items & Reasons ({bulkPreview.skipped_targets.length})
                      </label>
                      <div className="max-h-48 overflow-y-auto border border-border/60 rounded-lg divide-y divide-border/40 font-mono text-xs">
                        {bulkPreview.skipped_targets.map((st) => (
                          <div key={st.id} className="p-2.5 flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-foreground">{st.name}</span>
                              <span className="text-muted-foreground ml-2">({st.username || "no username"})</span>
                            </div>
                            <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/40 text-[10px]">
                              {st.reason}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Confirmation Safeguard */}
              {bulkStep === 3 && bulkPreview && (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-300 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-600" /> Carrier Safeguard Confirmation
                    </div>
                    <p>
                      You are about to enqueue <strong>{bulkPreview.eligible_count}</strong> individual network actions for execution.
                    </p>
                    <p className="text-[11px] opacity-90">
                      Each action will be dispatched to Celery background workers with distributed locking and a maximum of 3 retries.
                    </p>
                  </div>

                  <div className="p-4 bg-card border border-border rounded-lg space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Action:</span>
                      <span className="font-bold text-foreground">{bulkActionType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Eligible Operations:</span>
                      <span className="font-bold text-emerald-600">{bulkPreview.eligible_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Excluded / Skipped:</span>
                      <span className="font-bold text-amber-600">{bulkPreview.skipped_count}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Live Batch Execution & Results */}
              {bulkStep === 4 && activeBatch && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-foreground">Batch Status: {activeBatch.status}</span>
                      <span className="text-muted-foreground">
                        {activeBatch.success_count + activeBatch.failure_count} / {activeBatch.total_count} processed
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300"
                        style={{
                          width: `${activeBatch.total_count > 0 ? ((activeBatch.success_count + activeBatch.failure_count) / activeBatch.total_count) * 100 : 0}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 font-mono text-center">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                      <div className="text-xs font-semibold">Success</div>
                      <div className="text-2xl font-bold mt-1">{activeBatch.success_count}</div>
                    </div>
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-600 dark:text-rose-400">
                      <div className="text-xs font-semibold">Failed</div>
                      <div className="text-2xl font-bold mt-1">{activeBatch.failure_count}</div>
                    </div>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400">
                      <div className="text-xs font-semibold">Skipped</div>
                      <div className="text-2xl font-bold mt-1">{activeBatch.skipped_count}</div>
                    </div>
                  </div>

                  {activeBatch.error_summary && activeBatch.error_summary.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-destructive font-mono">
                        Failure Log ({activeBatch.error_summary.length})
                      </label>
                      <div className="max-h-40 overflow-y-auto border border-destructive/40 rounded-lg divide-y divide-border/40 font-mono text-xs">
                        {activeBatch.error_summary.map((err, idx) => (
                          <div key={idx} className="p-2.5 flex items-center justify-between bg-destructive/5">
                            <span className="font-semibold text-foreground">{err.target}</span>
                            <span className="text-destructive text-[11px]">{err.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border/60 flex items-center justify-between bg-card">
              <div>
                {bulkStep > 1 && bulkStep < 4 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkStep((prev) => (prev > 1 ? ((prev - 1) as any) : 1))}
                    disabled={bulkPreviewLoading || bulkExecuting}
                    className="gap-1 text-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {bulkStep === 1 && (
                  <Button
                    size="sm"
                    onClick={handleRunBulkPreview}
                    disabled={bulkPreviewLoading}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    {bulkPreviewLoading ? "Validating Candidates..." : "Validate & Preview"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}

                {bulkStep === 2 && (
                  <Button
                    size="sm"
                    onClick={() => setBulkStep(3)}
                    disabled={!bulkPreview || bulkPreview.eligible_count === 0}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    Proceed to Confirmation
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}

                {bulkStep === 3 && (
                  <Button
                    size="sm"
                    onClick={handleConfirmBulkQueue}
                    disabled={bulkExecuting}
                    className="gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {bulkExecuting ? "Queueing Asynchronous Jobs..." : "Confirm & Queue Jobs"}
                  </Button>
                )}

                {bulkStep === 4 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setBulkModalOpen(false);
                      loadNetworkActions();
                    }}
                    className="text-xs font-semibold"
                  >
                    Close & View in Queue
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ OPERATIONAL MODALS ════════════════════════ */}
      <RouterDiagnosticsModal
        isOpen={diagnosticsModalOpen}
        onClose={() => setDiagnosticsModalOpen(false)}
        router={diagnosticsRouter}
        allRouters={routersList}
        onSelectRouter={(id) => {
          const r = routersList.find((x) => x.id === id) || null;
          setDiagnosticsRouter(r);
        }}
      />

      <UnregisteredSecretsModal
        isOpen={unregisteredModalOpen}
        onClose={() => setUnregisteredModalOpen(false)}
        router={unregisteredRouter}
        onSecretImported={() => {
          if (selectedRouterId) loadRouterDetail(selectedRouterId);
          loadDashboard(true);
        }}
      />

      <OLTTerminalModal
        isOpen={terminalModalOpen}
        onClose={() => setTerminalModalOpen(false)}
        olt={terminalOlt}
      />

      <FiberNetworkMapModal
        isOpen={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        boxes={mapBoxes}
      />
    </div>
  );
}
