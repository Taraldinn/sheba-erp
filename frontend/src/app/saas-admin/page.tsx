"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Users,
  Server,
  Globe,
  ShieldCheck,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Power,
  Key,
  Layers,
  Activity,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  Sparkles,
  Lock,
  Cpu,
  Database,
  Radio,
  Sliders,
  Inbox,
  Clock,
  Trash2,
  DownloadCloud,
  Check,
  X,
  CreditCard,
  Receipt,
  FileText,
  AlertOctagon,
  FileJson,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function SaaSAdminPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "overview";
  const actionFromUrl = searchParams.get("action");

  const [activeTab, setActiveTab] = useState<string>(tabFromUrl);
  const [overview, setOverview] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [usersDir, setUsersDir] = useState<any>({ platform_admins: [], tenant_owners: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [planFilter, setPlanFilter] = useState("ALL");

  // Onboard Tenant Modal
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(actionFromUrl === "onboard");
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenantFormError, setTenantFormError] = useState("");
  const [tenantFormSuccess, setTenantFormSuccess] = useState<any>(null);
  const [tenantFormData, setTenantFormData] = useState({
    name: "",
    slug: "",
    domain: "",
    plan: "Growth",
    admin_email: "",
    admin_password: "",
    contact_phone: "+880 1700-000000",
    address: "Dhaka, Bangladesh",
    max_subscribers: 2500,
    max_routers: 10,
  });

  // Create Package Modal
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [packageFormData, setPackageFormData] = useState({
    name: "",
    code: "",
    description: "",
    monthly_price: 15000,
    yearly_price: 150000,
    max_subscribers: 2500,
    max_routers: 10,
    max_custom_domains: 3,
    features: "Up to 2,500 Subscribers\n10 Core Routers & OLTs\nOptical Signal Diagnostics\nDaily SMS Gateway",
  });

  // Register Domain Modal
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const [domainTenantId, setDomainTenantId] = useState("");
  const [domainHostname, setDomainHostname] = useState("");
  const [domainType, setDomainType] = useState("alias");

  // Disaster Recovery State
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [exportTenantId, setExportTenantId] = useState("");
  const [exportResult, setExportResult] = useState<any>(null);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const loadAllData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [ov, tList, dList, rList, pList, sList, payList, bList, uDir] = await Promise.all([
        ApiClient.getSaaSOverview(),
        ApiClient.getSaaSTenants(),
        ApiClient.getSaaSDomains(),
        ApiClient.getSaaSTenantRequests(),
        ApiClient.getSaaSPackages(),
        ApiClient.getSaaSSubscriptions(),
        ApiClient.getSaaSPayments(),
        ApiClient.getSaaSBackups(),
        ApiClient.getSaaSUserDirectory(),
      ]);
      setOverview(ov);
      setTenants(tList || []);
      setDomains(dList || []);
      setRequests(rList || []);
      setPackages(pList || []);
      setSubscriptions(sList || []);
      setPayments(payList || []);
      setBackups(bList || []);
      setUsersDir(uDir || { platform_admins: [], tenant_owners: [] });
      if (tList?.length > 0 && !domainTenantId) {
        setDomainTenantId(tList[0].id);
        setExportTenantId(tList[0].id);
      }
    } catch (err) {
      console.error("Failed to load SaaS Control Plane data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // ── Tenant Handlers ──
  const handleToggleTenantStatus = async (tenantId: string) => {
    try {
      await ApiClient.toggleSaaSTenantStatus(tenantId);
      await loadAllData();
    } catch (err: any) {
      alert("Action failed: " + err.message);
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await ApiClient.impersonateTenant(tenantId);
      if (res.token) {
        localStorage.setItem("sheba_token", res.token);
        localStorage.setItem("sheba_auth_token", res.token);
        localStorage.setItem("sheba_user_role", res.role || "admin");
        localStorage.setItem("sheba_user_name", res.impersonated_user || "admin");
        window.location.href = "/";
      }
    } catch (err: any) {
      alert("Impersonation failed: " + err.message);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantFormError("");
    setTenantFormSuccess(null);
    setCreatingTenant(true);
    try {
      const res = await ApiClient.createSaaSTenant(tenantFormData);
      setTenantFormSuccess(res);
      await loadAllData();
      setTimeout(() => {
        setIsTenantModalOpen(false);
        setTenantFormSuccess(null);
      }, 2000);
    } catch (err: any) {
      setTenantFormError(err.message || "Failed to onboard tenant");
    } finally {
      setCreatingTenant(false);
    }
  };

  // ── Request Handlers ──
  const handleApproveRequest = async (requestId: string) => {
    try {
      const res = await ApiClient.approveSaaSTenantRequest(requestId);
      alert(`Tenant provisioned successfully! Admin username: ${res.admin_username}`);
      await loadAllData();
    } catch (err: any) {
      alert("Approval failed: " + err.message);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    const reason = prompt("Enter reason for rejection:", "Does not meet ISP verification requirements");
    if (reason === null) return;
    try {
      await ApiClient.rejectSaaSTenantRequest(requestId, reason);
      await loadAllData();
    } catch (err: any) {
      alert("Rejection failed: " + err.message);
    }
  };

  // ── Package Handlers ──
  const handleTogglePackageStatus = async (pkgId: string) => {
    try {
      await ApiClient.toggleSaaSPackageStatus(pkgId);
      await loadAllData();
    } catch (err: any) {
      alert("Toggle failed: " + err.message);
    }
  };

  const handleDeletePackage = async (pkgId: string) => {
    if (!confirm("Are you sure you want to delete this SaaS package tier?")) return;
    try {
      await ApiClient.deleteSaaSPackage(pkgId);
      await loadAllData();
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const featuresArray = packageFormData.features
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      await ApiClient.createSaaSPackage({
        ...packageFormData,
        features: featuresArray,
      });
      setIsPackageModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      alert("Package creation failed: " + err.message);
    }
  };

  // ── Disaster Recovery Handlers ──
  const handleTriggerBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await ApiClient.createSaaSBackup(backupName || undefined);
      alert(`Full Database Backup Created! Snapshot: ${res.backup.filename} (${res.backup.file_size_formatted})`);
      setBackupName("");
      await loadAllData();
    } catch (err: any) {
      alert("Backup creation failed: " + err.message);
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleExportTenant = async () => {
    if (!exportTenantId) return;
    try {
      const res = await ApiClient.exportSaaSTenantData(exportTenantId);
      setExportResult(res);
      await loadAllData();
    } catch (err: any) {
      alert("Export failed: " + err.message);
    }
  };

  // ── Domain Handlers ──
  const handleCreateDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createSaaSDomain({
        tenant: domainTenantId,
        hostname: domainHostname.trim().toLowerCase(),
        domain_type: domainType,
      });
      setIsDomainModalOpen(false);
      setDomainHostname("");
      await loadAllData();
    } catch (err: any) {
      alert("Domain registration failed: " + err.message);
    }
  };

  const handleToggleDomainVerify = async (domainId: string | number) => {
    try {
      await ApiClient.toggleSaaSDomainVerify(domainId);
      await loadAllData();
    } catch (err: any) {
      alert("Verification toggle failed: " + err.message);
    }
  };

  const kpis = overview?.kpis || {
    total_tenants: tenants.length,
    active_tenants: tenants.filter((t) => t.is_active).length,
    suspended_tenants: tenants.filter((t) => !t.is_active).length,
    pending_requests: requests.filter((r) => r.status === "pending").length,
    total_subscribers: 13,
    active_subscribers: 9,
    total_packages: packages.length,
    total_backups: backups.length,
    platform_mrr: 45000,
  };

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.primary_domain && t.primary_domain.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus =
      statusFilter === "ALL" || (statusFilter === "ACTIVE" ? t.is_active : !t.is_active);
    const matchesPlan = planFilter === "ALL" || t.plan === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full text-xs">
      {/* ── Top Overview Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-violet-50/90 via-white to-indigo-50/80 dark:from-violet-950/40 dark:via-card dark:to-indigo-950/30 p-6 rounded-2xl border border-slate-200 dark:border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              CENTRAL SAAS OVERSEER
            </span>
            <span className="text-xs text-slate-500 dark:text-muted-foreground font-medium">• Software Operations & Multi-Tenant Recovery</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-foreground">
            ShebaFi Global Control Plane
          </h1>
          <p className="text-xs text-slate-600 dark:text-muted-foreground mt-0.5 max-w-3xl">
            Manage multi-tenant ISP organizations, onboarding requests, subscription packages, software licensing payments, and database disaster recovery.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadAllData(true)}
            disabled={refreshing}
            className="text-xs gap-1.5 h-9 border-slate-300 dark:border-border text-slate-700 dark:text-foreground hover:bg-slate-100 dark:hover:bg-accent font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-indigo-500" : ""}`} />
            Refresh Telemetry
          </Button>

          <Button
            size="sm"
            onClick={() => setIsTenantModalOpen(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5 h-9 shadow-sm shadow-violet-600/20 font-semibold"
          >
            <Plus className="h-4 w-4" />
            Onboard New ISP Tenant
          </Button>
        </div>
      </div>

      {/* ── Global Platform Telemetry Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card/60 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-violet-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-500 dark:text-muted-foreground tracking-wider uppercase">TOTAL TENANTS</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-foreground">{kpis.total_tenants} ISPs</div>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-1">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">{kpis.active_tenants} Active</span> ·{" "}
              <span className="text-rose-700 dark:text-rose-400 font-bold">{kpis.suspended_tenants} Suspended</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card/60 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-500 dark:text-muted-foreground tracking-wider uppercase">PENDING REQUESTS</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Inbox className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{kpis.pending_requests} Signups</div>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-1 font-medium">
              New tenant onboarding requests awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card/60 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-500 dark:text-muted-foreground tracking-wider uppercase">HOSTED END-USERS</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-foreground">{Number(kpis.total_subscribers || 0).toLocaleString()} Lines</div>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-1 font-medium">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">{kpis.active_subscribers} Active</span> PPPoE across all ISPs
            </p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card/60 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-500 dark:text-muted-foreground tracking-wider uppercase">SOFTWARE MRR</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-sky-100 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-foreground">৳{Number(kpis.platform_mrr || 0).toLocaleString()}</div>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-1 font-medium">
              Monthly recurring SaaS license revenue
            </p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card/60 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-teal-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-500 dark:text-muted-foreground tracking-wider uppercase">DISASTER RECOVERY</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-teal-100 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Database className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-teal-700 dark:text-emerald-400">{kpis.total_backups} Backups</div>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-1 font-medium">
              Full DB snapshots & isolation exports ready
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── MODULE 1: ACTIVE TENANTS DIRECTORY ── */}
      {(activeTab === "tenants" || activeTab === "overview") && (
        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-slate-100 dark:border-border/60">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Active ISP Tenants Directory ({tenants.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground">
                All deployed ISP tenant instances with resource quotas and live workspace launch actions.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Search tenant or domain..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-48 text-xs border-slate-300 dark:border-input bg-slate-50 dark:bg-muted/40 text-slate-900 dark:text-foreground placeholder:text-slate-400"
              />
              <Button size="sm" onClick={() => setIsTenantModalOpen(true)} className="h-8 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white font-medium">
                <Plus className="h-3.5 w-3.5" />
                New Tenant
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-muted/50 text-slate-700 dark:text-muted-foreground font-bold border-b border-slate-200 dark:border-border text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">ISP Organization</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Hostname / FQDN</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Package Tier</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Subscribers Quota</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Routers Quota</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Status</th>
                    <th className="p-3.5 text-right text-slate-700 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                      <td className="p-3.5">
                        <p className="font-bold text-slate-900 dark:text-foreground">{t.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-muted-foreground font-mono">slug: {t.slug}</p>
                      </td>
                      <td className="p-3.5">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{t.primary_domain}</span>
                      </td>
                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px] font-semibold border-slate-300 dark:border-border text-slate-800 dark:text-slate-200">
                          {t.plan}
                        </Badge>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">
                        {t.subscriber_count} / {t.max_subscribers || 2500}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">
                        {t.router_count} / {t.max_routers || 10}
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] gap-1 font-semibold ${
                            t.is_active
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                              : "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${t.is_active ? "bg-emerald-600 dark:bg-emerald-400 animate-pulse" : "bg-rose-600 dark:bg-rose-400"}`} />
                          {t.is_active ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleTenantStatus(t.id)}
                            className="h-7 text-[11px] gap-1 border-slate-300 dark:border-border text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-accent font-medium"
                          >
                            <Power className="h-3 w-3" />
                            <span>{t.is_active ? "Suspend" : "Activate"}</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleImpersonate(t.id)}
                            className="h-7 text-[11px] gap-1 bg-violet-600 hover:bg-violet-700 text-white font-medium"
                          >
                            <Key className="h-3 w-3" />
                            <span>Launch Portal</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MODULE 2: ONBOARDING REQUESTS QUEUE ── */}
      {activeTab === "requests" && (
        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-border/60">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
              <Inbox className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Tenant Onboarding Requests Queue ({requests.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground">
              Prospective ISP customers requesting a new ShebaFi instance. Review, approve with automated deployment, or reject.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-muted/50 text-slate-700 dark:text-muted-foreground font-bold border-b border-slate-200 dark:border-border text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Requested Organization</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Contact Person</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Desired Hostname</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Requested Plan</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Status</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Submitted Date</th>
                    <th className="p-3.5 text-right text-slate-700 dark:text-slate-300">Decision Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center p-8 text-slate-500 dark:text-muted-foreground">
                        No pending onboarding requests found.
                      </td>
                    </tr>
                  ) : (
                    requests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                        <td className="p-3.5">
                          <p className="font-bold text-slate-900 dark:text-foreground">{r.organization_name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-muted-foreground font-mono">slug: {r.requested_slug}</p>
                        </td>
                        <td className="p-3.5">
                          <p className="font-semibold text-slate-800 dark:text-foreground">{r.contact_name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{r.contact_email} · {r.contact_phone}</p>
                        </td>
                        <td className="p-3.5 font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                          {r.requested_domain || `${r.requested_slug}.shebafi.xyz`}
                        </td>
                        <td className="p-3.5">
                          <Badge variant="outline" className="text-[10px] font-semibold border-slate-300 dark:border-border text-slate-800 dark:text-slate-200">
                            {r.requested_plan}
                          </Badge>
                        </td>
                        <td className="p-3.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-semibold ${
                              r.status === "approved"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30"
                                : r.status === "rejected"
                                ? "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30"
                                : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30"
                            }`}
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-muted-foreground font-mono text-[11px]">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-3.5 text-right">
                          {r.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => handleApproveRequest(r.id)}
                                className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                              >
                                <Check className="h-3 w-3" />
                                <span>Approve & Deploy</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRejectRequest(r.id)}
                                className="h-7 text-[11px] gap-1 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-medium"
                              >
                                <X className="h-3 w-3" />
                                <span>Reject</span>
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 dark:text-muted-foreground italic font-medium">Processed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MODULE 3: SAAS PACKAGES & PRICING TIERS ── */}
      {activeTab === "packages" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-card p-4 rounded-xl border border-slate-200/90 dark:border-border shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-foreground text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                SaaS Subscription Packages & Pricing Tiers
              </h3>
              <p className="text-xs text-slate-500 dark:text-muted-foreground">
                Define and manage commercial tiers, subscriber limits, router quotas, and pause/resume package availability.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setIsPackageModalOpen(true)}
              className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Package Tier
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <Card
                key={pkg.id}
                className={`border bg-white dark:bg-card/60 relative overflow-hidden transition-all shadow-xs ${
                  !pkg.is_active ? "opacity-60 border-dashed border-slate-300 dark:border-border" : "border-slate-200/90 dark:border-border"
                }`}
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 ${
                    pkg.is_active ? "bg-violet-600" : "bg-slate-400 dark:bg-muted-foreground"
                  }`}
                />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${
                        pkg.is_active
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30"
                          : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-muted dark:text-muted-foreground"
                      }`}
                    >
                      {pkg.is_active ? "ACTIVE TIER" : "PAUSED"}
                    </Badge>
                    <span className="text-xs font-bold text-slate-600 dark:text-muted-foreground">{pkg.subscribers_enrolled} Tenants</span>
                  </div>
                  <CardTitle className="text-lg font-black text-slate-900 dark:text-foreground mt-2">{pkg.name}</CardTitle>
                  <div className="text-2xl font-black text-slate-900 dark:text-foreground mt-1">
                    ৳{(Number(pkg.monthly_price) || 0).toLocaleString()}
                    <span className="text-xs font-normal text-slate-500 dark:text-muted-foreground"> / mo</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-muted-foreground">
                    <div className="flex items-center justify-between text-slate-800 dark:text-foreground">
                      <span>Max Subscribers Quota:</span>
                      <span className="font-bold text-slate-900 dark:text-foreground">{pkg.max_subscribers} Lines</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-800 dark:text-foreground">
                      <span>Max Routers Quota:</span>
                      <span className="font-bold text-slate-900 dark:text-foreground">{pkg.max_routers} NAS Gateways</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-800 dark:text-foreground">
                      <span>Custom Domains:</span>
                      <span className="font-bold text-slate-900 dark:text-foreground">{pkg.max_custom_domains} FQDNs</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-border flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTogglePackageStatus(pkg.id)}
                      className="h-7 text-xs gap-1 border-slate-300 dark:border-border text-slate-700 dark:text-foreground hover:bg-slate-100 dark:hover:bg-accent font-medium"
                    >
                      <Power className="h-3 w-3" />
                      <span>{pkg.is_active ? "Pause Package" : "Resume"}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeletePackage(pkg.id)}
                      className="h-7 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── MODULE 4: DISASTER RECOVERY & DATABASE BACKUP SYSTEM ── */}
      {(activeTab === "backups" || activeTab === "export") && (
        <div className="space-y-6">
          {/* Recovery Actions Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-border/60">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Trigger Full Database Snapshot
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground">
                  Captures an instantaneous, consistent physical database backup with SHA-256 integrity checksums.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <Input
                  placeholder="Optional custom snapshot label (e.g. Pre-Upgrade Backup)"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  className="h-9 text-xs border-slate-300 dark:border-input bg-slate-50 dark:bg-muted/40 text-slate-900 dark:text-foreground placeholder:text-slate-400"
                />
                <Button
                  onClick={handleTriggerBackup}
                  disabled={creatingBackup}
                  className="w-full h-9 text-xs gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>{creatingBackup ? "Creating Physical Snapshot..." : "Create Full Backup Now"}</span>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-border/60">
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                  <DownloadCloud className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  Single-Tenant Data Isolation Export
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground">
                  Extracts complete relational data for an isolated tenant as a portable JSON snapshot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <select
                  value={exportTenantId}
                  onChange={(e) => setExportTenantId(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-300 dark:border-input bg-slate-50 dark:bg-background px-3 py-1 text-xs shadow-xs text-slate-900 dark:text-foreground"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
                <Button
                  onClick={handleExportTenant}
                  className="w-full h-9 text-xs gap-2 bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-xs"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  <span>Export Tenant Dataset</span>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Backup Archives Table */}
          <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-border/60">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                <Database className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Database Backup Archives & Recovery Checkpoints ({backups.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-muted/50 text-slate-700 dark:text-muted-foreground font-bold border-b border-slate-200 dark:border-border text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5 text-slate-700 dark:text-slate-300">Backup Name / Label</th>
                      <th className="p-3.5 text-slate-700 dark:text-slate-300">Archive Filename</th>
                      <th className="p-3.5 text-slate-700 dark:text-slate-300">Type</th>
                      <th className="p-3.5 text-slate-700 dark:text-slate-300">File Size</th>
                      <th className="p-3.5 text-slate-700 dark:text-slate-300">SHA-256 Checksum</th>
                      <th className="p-3.5 text-slate-700 dark:text-slate-300">Created Timestamp</th>
                      <th className="p-3.5 text-right text-slate-700 dark:text-slate-300">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-border">
                    {backups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center p-8 text-slate-500 dark:text-muted-foreground font-medium">
                          No backup snapshots recorded yet. Trigger one above.
                        </td>
                      </tr>
                    ) : (
                      backups.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">{b.backup_name}</td>
                          <td className="p-3.5 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">{b.filename}</td>
                          <td className="p-3.5">
                            <Badge variant="outline" className="text-[10px] uppercase font-semibold border-slate-300 dark:border-border text-slate-800 dark:text-slate-200">
                              {b.backup_type}
                            </Badge>
                          </td>
                          <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">{b.file_size_formatted}</td>
                          <td className="p-3.5 font-mono text-[10px] text-slate-500 dark:text-muted-foreground max-w-xs truncate">
                            {b.checksum || "Verified"}
                          </td>
                          <td className="p-3.5 text-slate-600 dark:text-muted-foreground font-mono text-[11px]">
                            {new Date(b.created_at).toLocaleString()}
                          </td>
                          <td className="p-3.5 text-right">
                            <a
                              href={`http://localhost:8000/api/v1/saas/backups/${b.id}/download/`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-slate-300 dark:border-border text-slate-700 dark:text-foreground hover:bg-slate-100 dark:hover:bg-accent font-medium">
                                <DownloadCloud className="h-3 w-3" />
                                <span>Download</span>
                              </Button>
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MODULE 5: SOFTWARE USER & TENANT OWNER DIRECTORY ── */}
      {(activeTab === "users" || activeTab === "tenant-owners") && (
        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-border/60">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Software User Management & Tenant Master Owners ({usersDir.total_users || 0})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground">
              Directory of Central Platform Administrators and Tenant Managing Directors.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-muted/50 text-slate-700 dark:text-muted-foreground font-bold border-b border-slate-200 dark:border-border text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">User / Account</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Email & Phone</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Assigned Organization</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Platform Role</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Last Login</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {/* Platform Super Admins */}
                  {usersDir.platform_admins?.map((u: any) => (
                    <tr key={`sa-${u.id}`} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors bg-violet-50/40 dark:bg-violet-500/5">
                      <td className="p-3.5 font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        <span>{u.username}</span>
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-muted-foreground">{u.email || "admin@shebafi.xyz"}</td>
                      <td className="p-3.5 font-bold text-violet-700 dark:text-violet-400">Global Control Plane</td>
                      <td className="p-3.5">
                        <Badge className="bg-violet-600 text-white text-[10px] font-bold">PLATFORM ADMIN</Badge>
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-muted-foreground font-mono text-[11px]">{u.last_login}</td>
                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold">
                          Active
                        </Badge>
                      </td>
                    </tr>
                  ))}

                  {/* Tenant Owners */}
                  {usersDir.tenant_owners?.map((o: any) => (
                    <tr key={`to-${o.id}`} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">{o.username}</td>
                      <td className="p-3.5 text-slate-600 dark:text-muted-foreground">{o.email} · {o.phone}</td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">{o.tenant_name}</td>
                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px] font-semibold border-slate-300 dark:border-border text-slate-800 dark:text-slate-200">
                          Tenant Owner
                        </Badge>
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-muted-foreground font-mono text-[11px]">{o.last_login}</td>
                      <td className="p-3.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            o.is_active
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                              : "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                          }`}
                        >
                          {o.is_active ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MODULE 6: DOMAIN ROUTING CENTER ── */}
      {activeTab === "domains" && (
        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-slate-100 dark:border-border/60">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Global Domain Routing & DNS Directory ({domains.length})
              </CardTitle>
            </div>
            <Button size="sm" onClick={() => setIsDomainModalOpen(true)} className="h-8 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
              <Plus className="h-3.5 w-3.5" />
              Register Domain
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-muted/50 text-slate-700 dark:text-muted-foreground font-bold border-b border-slate-200 dark:border-border text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Hostname</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Target Tenant</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Type</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Verification</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">SSL Certificate</th>
                    <th className="p-3.5 text-right text-slate-700 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {domains.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">{d.hostname}</td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">{d.tenant_name}</td>
                      <td className="p-3.5"><Badge variant="outline" className="text-[10px] uppercase font-semibold border-slate-300 dark:border-border text-slate-800 dark:text-slate-200">{d.domain_type}</Badge></td>
                      <td className="p-3.5">
                        {d.verified ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-bold inline-flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-sky-700 dark:text-sky-400 font-semibold inline-flex items-center gap-1 mt-3">
                        <Lock className="h-3 w-3" /> Let&apos;s Encrypt
                      </td>
                      <td className="p-3.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleToggleDomainVerify(d.id)} className="h-7 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 font-medium">
                          {d.verified ? "Mark Pending" : "Verify"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MODULE 7: TENANT SUBSCRIPTIONS ── */}
      {activeTab === "subscriptions" && (
        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-border/60">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Tenant Software Licenses & Active Subscriptions ({subscriptions.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground">
              Software licensing agreements, subscription tiers, renewal terms, and recurring billing schedules.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-muted/50 text-slate-700 dark:text-muted-foreground font-bold border-b border-slate-200 dark:border-border text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Tenant / Organization</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">SaaS Package</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Billing Interval</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Contract Amount</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Starts At</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Renews / Expires</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">License Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center p-8 text-slate-500 dark:text-muted-foreground font-medium">
                        No subscription contracts logged yet.
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">{s.tenant_name || "Active Tenant"}</td>
                        <td className="p-3.5 font-semibold text-violet-700 dark:text-violet-400">{s.package_name || "Growth Tier"}</td>
                        <td className="p-3.5 font-semibold capitalize text-slate-800 dark:text-foreground">{s.billing_cycle || "Monthly"}</td>
                        <td className="p-3.5 font-black text-slate-900 dark:text-foreground">৳{(Number(s.amount) || 0).toLocaleString()}</td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-muted-foreground">{s.starts_at ? new Date(s.starts_at).toLocaleDateString() : "—"}</td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-muted-foreground">{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"}</td>
                        <td className="p-3.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-bold ${
                              s.status === "active"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                : "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                            }`}
                          >
                            {s.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MODULE 8: SOFTWARE PAYMENT LEDGER ── */}
      {activeTab === "payments" && (
        <Card className="border border-slate-200/90 dark:border-border bg-white dark:bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-border/60">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              SaaS Software Payment Ledger & Revenue Transactions ({payments.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-muted-foreground">
              Complete audit ledger of incoming SaaS platform subscription payments, gateway receipts, and bank wires.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-muted/50 text-slate-700 dark:text-muted-foreground font-bold border-b border-slate-200 dark:border-border text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Transaction Ref</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Paying Organization</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Payment Gateway</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Amount Paid</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Receipt Timestamp</th>
                    <th className="p-3.5 text-slate-700 dark:text-slate-300">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500 dark:text-muted-foreground font-medium">
                        No payment transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-muted/30 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">{p.transaction_ref || p.id.slice(0, 8)}</td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-foreground">{p.tenant_name || "Sheba Broadband Network"}</td>
                        <td className="p-3.5 font-semibold text-slate-800 dark:text-foreground capitalize">{p.payment_method || "Bank Wire"}</td>
                        <td className="p-3.5 font-black text-slate-900 dark:text-foreground">৳{(Number(p.amount) || 0).toLocaleString()}</td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                        <td className="p-3.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-bold ${
                              p.status === "completed"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                            }`}
                          >
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MODAL: ONBOARD NEW ISP TENANT ── */}
      {isTenantModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-violet-400" />
                  Onboard New ISP Tenant
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Provisions dedicated database scoping, company settings, domain mapping, and administrator login.
                </p>
              </div>
              <button onClick={() => setIsTenantModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            {tenantFormError && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg">{tenantFormError}</div>}
            {tenantFormSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg">
                <p className="font-bold">{tenantFormSuccess.message}</p>
                <p className="mt-1">Admin Username: <span className="font-mono font-bold">{tenantFormSuccess.admin_credentials.username}</span></p>
                <p>Initial Password: <span className="font-mono font-bold">{tenantFormSuccess.admin_credentials.password}</span></p>
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Company / ISP Name *</label>
                  <Input
                    required
                    placeholder="e.g. Apex Broadband Network"
                    value={tenantFormData.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
                      setTenantFormData({ ...tenantFormData, name, slug, domain: `${slug}.shebafi.xyz` });
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">Tenant Slug *</label>
                  <Input
                    required
                    value={tenantFormData.slug}
                    onChange={(e) => setTenantFormData({ ...tenantFormData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Primary Hostname *</label>
                  <Input
                    required
                    value={tenantFormData.domain}
                    onChange={(e) => setTenantFormData({ ...tenantFormData, domain: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">Subscription Plan</label>
                  <select
                    value={tenantFormData.plan}
                    onChange={(e) => setTenantFormData({ ...tenantFormData, plan: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs"
                  >
                    <option value="Starter">Starter (500 Subs, ৳5k/mo)</option>
                    <option value="Growth">Growth (2,500 Subs, ৳15k/mo)</option>
                    <option value="Enterprise">Enterprise (Unlimited, ৳35k/mo)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Admin Email *</label>
                  <Input
                    type="email"
                    required
                    value={tenantFormData.admin_email}
                    onChange={(e) => setTenantFormData({ ...tenantFormData, admin_email: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">Initial Password</label>
                  <Input
                    placeholder="Defaults to sheba1234"
                    value={tenantFormData.admin_password}
                    onChange={(e) => setTenantFormData({ ...tenantFormData, admin_password: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsTenantModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={creatingTenant} className="bg-violet-600 hover:bg-violet-700 text-white">
                  {creatingTenant ? "Deploying Tenant..." : "Deploy Tenant Instance"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE SAAS PACKAGE ── */}
      {isPackageModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-400" />
                Create SaaS Package Tier
              </h3>
              <button onClick={() => setIsPackageModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleCreatePackage} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">Tier Name *</label>
                <Input
                  required
                  placeholder="e.g. Ultra Fiber Pro"
                  value={packageFormData.name}
                  onChange={(e) => setPackageFormData({ ...packageFormData, name: e.target.value, code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Monthly Price (৳) *</label>
                  <Input
                    type="number"
                    required
                    value={packageFormData.monthly_price}
                    onChange={(e) => setPackageFormData({ ...packageFormData, monthly_price: Number(e.target.value) })}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">Max Subscribers *</label>
                  <Input
                    type="number"
                    required
                    value={packageFormData.max_subscribers}
                    onChange={(e) => setPackageFormData({ ...packageFormData, max_subscribers: Number(e.target.value) })}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">Key Features (One per line)</label>
                <textarea
                  rows={4}
                  value={packageFormData.features}
                  onChange={(e) => setPackageFormData({ ...packageFormData, features: e.target.value })}
                  className="w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPackageModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">Create Tier</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTER DOMAIN ── */}
      {isDomainModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-400" />
                Register Custom Domain
              </h3>
              <button onClick={() => setIsDomainModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleCreateDomain} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">Target Tenant</label>
                <select
                  value={domainTenantId}
                  onChange={(e) => setDomainTenantId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">Fully Qualified Hostname *</label>
                <Input
                  required
                  placeholder="e.g. portal.ispbrand.com"
                  value={domainHostname}
                  onChange={(e) => setDomainHostname(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsDomainModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">Map Domain</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
