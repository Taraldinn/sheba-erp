"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Users,
  Search,
  RefreshCw,
  UserPlus,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Server,
  Layers,
  Check,
  ShieldAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import { Router, UnregisteredSecret } from "@/types";

interface UnregisteredSecretsModalProps {
  isOpen: boolean;
  onClose: () => void;
  router: Router | null;
  onSecretImported?: () => void;
}

export function UnregisteredSecretsModal({
  isOpen,
  onClose,
  router,
  onSecretImported,
}: UnregisteredSecretsModalProps) {
  const [secrets, setSecrets] = useState<UnregisteredSecret[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Quick Import individual loading state
  const [importingUser, setImportingUser] = useState<string | null>(null);

  // Bulk Operations
  const [isImportingAll, setIsImportingAll] = useState(false);
  const [isSyncingClients, setIsSyncingClients] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    created?: number;
    updated?: number;
    disabled?: number;
    disconnected?: number;
    failed?: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen && router) {
      loadSecrets();
    } else {
      setSecrets([]);
      setError(null);
      setSuccessMessage(null);
      setSyncResult(null);
    }
  }, [isOpen, router]);

  async function loadSecrets() {
    if (!router) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await ApiClient.getUnregisteredSecrets(router.id);
      const rawSecrets: UnregisteredSecret[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.secrets)
        ? data.secrets
        : [];
      setSecrets(rawSecrets);
    } catch (err: any) {
      setError(err?.message || "Failed to load unregistered secrets from MikroTik.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleQuickImport(secret: UnregisteredSecret) {
    if (!router) return;
    const username = secret.username || secret.name;
    if (!username) return;

    setImportingUser(username);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await ApiClient.quickImportSecret(router.id, username);
      setSuccessMessage(
        `Subscriber "${username}" imported successfully with 1-day grace credit!`
      );
      // Remove from list
      setSecrets((prev) => prev.filter((s) => (s.username || s.name) !== username));
      if (onSecretImported) onSecretImported();
    } catch (err: any) {
      setError(err?.message || `Failed to import secret "${username}".`);
    } finally {
      setImportingUser(null);
    }
  }

  async function handleImportAll() {
    if (!router || secrets.length === 0) return;
    if (
      !confirm(
        `Are you sure you want to import all ${secrets.length} unregistered secrets as ERP customers? Each will receive 1-day grace credit.`
      )
    ) {
      return;
    }

    setIsImportingAll(true);
    setError(null);
    setSuccessMessage(null);

    let successCount = 0;
    let failCount = 0;

    for (const secret of [...secrets]) {
      const username = secret.username || secret.name;
      if (!username) continue;
      try {
        await ApiClient.quickImportSecret(router.id, username);
        successCount++;
        setSecrets((prev) => prev.filter((s) => (s.username || s.name) !== username));
      } catch {
        failCount++;
      }
    }

    setIsImportingAll(false);
    setSuccessMessage(
      `Batch import completed: ${successCount} imported successfully${
        failCount > 0 ? `, ${failCount} failed` : ""
      }.`
    );
    if (onSecretImported) onSecretImported();
  }

  async function handleSyncAllClients() {
    if (!router) return;
    setIsSyncingClients(true);
    setError(null);
    setSuccessMessage(null);
    setSyncResult(null);

    try {
      const res = await ApiClient.syncAllRouterClients(router.id);
      setSyncResult(res);
      setSuccessMessage("RouterOS subscribers synchronized with ERP database.");
      await loadSecrets();
      if (onSecretImported) onSecretImported();
    } catch (err: any) {
      setError(err?.message || "Client synchronization failed.");
    } finally {
      setIsSyncingClients(false);
    }
  }

  const filteredSecrets = useMemo(() => {
    if (!searchQuery.trim()) return secrets;
    const q = searchQuery.toLowerCase();
    return secrets.filter((s) => {
      const u = (s.username || s.name || "").toLowerCase();
      const p = (s.profile || "").toLowerCase();
      const c = (s.comment || "").toLowerCase();
      return u.includes(q) || p.includes(q) || c.includes(q);
    });
  }, [secrets, searchQuery]);

  if (!router) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  Unregistered PPPoE Secrets
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Discover and import subscribers present in RouterOS but not yet mapped in ERP
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {secrets.length} Unregistered
            </Badge>
          </div>

          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground border-t border-border/50">
            <Server className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-foreground">{router.name}</span>
            <span className="font-mono">({router.ip_address})</span>
          </div>
        </DialogHeader>

        {/* Global Action Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by username, profile, or comment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSecrets}
              disabled={isLoading}
              className="text-xs gap-1.5 h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAllClients}
              disabled={isSyncingClients || isLoading}
              className="text-xs gap-1.5 h-9"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSyncingClients ? "animate-spin" : ""}`} />
              Sync to Router
            </Button>

            <Button
              size="sm"
              onClick={handleImportAll}
              disabled={isImportingAll || isLoading || secrets.length === 0}
              className="text-xs gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Import All ({secrets.length})
            </Button>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {syncResult && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-foreground font-mono space-y-1">
            <div className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Synchronization Summary:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] pt-1">
              <span>Created: <b>{syncResult.created ?? 0}</b></span>
              <span>Updated: <b>{syncResult.updated ?? 0}</b></span>
              <span>Disabled: <b>{syncResult.disabled ?? 0}</b></span>
              <span>Kicked: <b>{syncResult.disconnected ?? 0}</b></span>
              <span>Failed: <b>{syncResult.failed ?? 0}</b></span>
            </div>
          </div>
        )}

        {/* Secrets Table */}
        <div className="border border-border/70 rounded-xl overflow-hidden mt-1 shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 text-muted-foreground border-b border-border/70 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Subscriber Username</th>
                <th className="py-2.5 px-3">Profile</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Comment / Notes</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-primary mb-2" />
                    Querying RouterOS PPP secrets...
                  </td>
                </tr>
              ) : filteredSecrets.length > 0 ? (
                filteredSecrets.map((s, idx) => {
                  const uname = s.username || s.name || `unknown-${idx}`;
                  const isBusy = importingUser === uname;
                  return (
                    <tr key={uname} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-foreground flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-primary" />
                        {uname}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[11px] font-mono">
                          {s.profile || "default"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={s.disabled ? "destructive" : "success"}
                          className="text-[10px]"
                        >
                          {s.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[180px] font-sans">
                        {s.comment || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickImport(s)}
                          disabled={isBusy || isImportingAll}
                          className="text-xs h-7 gap-1 font-semibold hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30"
                        >
                          {isBusy ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-3 h-3 text-emerald-500" />
                              Quick Import
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground font-sans">
                    {searchQuery ? (
                      `No unregistered secrets match "${searchQuery}".`
                    ) : (
                      <div className="space-y-1">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                        <p className="font-semibold text-foreground">
                          All RouterOS secrets are registered in Sheba ERP!
                        </p>
                        <p className="text-xs text-muted-foreground">
                          No orphaned PPPoE secrets found on this router.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
