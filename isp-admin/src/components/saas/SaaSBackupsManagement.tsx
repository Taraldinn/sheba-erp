'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  RotateCcw,
  Trash2,
  RefreshCw,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { DatabaseBackup, SaaSTenant } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSBackupsManagementProps {
  backups: DatabaseBackup[];
  tenants: SaaSTenant[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateBackup: (name?: string, backup_type?: string) => Promise<void>;
  onExportTenant: (tenantId: string) => Promise<void>;
  onRestoreBackup: (backupId: string) => Promise<void>;
  onDeleteBackup: (backupId: string) => Promise<void>;
}

export function SaaSBackupsManagement({
  backups,
  tenants,
  isLoading,
  onRefresh,
  onCreateBackup,
  onExportTenant,
  onRestoreBackup,
  onDeleteBackup,
}: SaaSBackupsManagementProps) {
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [backupType, setBackupType] = useState('full_database');
  const [selectedTenant, setSelectedTenant] = useState(tenants[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tenants.length > 0 && (!selectedTenant || !tenants.some((t) => t.id === selectedTenant))) {
      setSelectedTenant(tenants[0]?.id || '');
    }
  }, [tenants, selectedTenant]);

  // Restore Confirmation
  const [backupToRestore, setBackupToRestore] = useState<DatabaseBackup | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Delete Confirmation
  const [backupToDelete, setBackupToDelete] = useState<DatabaseBackup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      if (backupType === 'tenant_data') {
        await onExportTenant(selectedTenant);
      } else {
        await onCreateBackup(backupName.trim() || undefined, backupType);
      }
      setIsBackupModalOpen(false);
      setBackupName('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Backup trigger failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!backupToRestore) return;
    setIsRestoring(true);
    try {
      await onRestoreBackup(backupToRestore.id);
      setBackupToRestore(null);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!backupToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteBackup(backupToDelete.id);
      setBackupToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div>
          <h3 className="text-sm font-bold text-foreground">Disaster Recovery & Snapshots</h3>
          <p className="text-xs text-muted-foreground">
            Point-in-time PostgreSQL database snapshots, single-tenant exports, and restoration routines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsBackupModalOpen(true)}
            className="text-xs h-9 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Trigger Backup</span>
          </Button>
        </div>
      </div>

      {/* Backups List */}
      {isLoading && backups.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : backups.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Database Snapshots Available</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Trigger a full database snapshot or single-tenant export to archive system state.
          </p>
          <Button
            size="sm"
            onClick={() => setIsBackupModalOpen(true)}
            className="text-xs bg-violet-600 text-white mt-2"
          >
            Create First Backup
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-3.5 font-semibold">Snapshot Name</th>
                <th className="p-3.5 font-semibold">Type</th>
                <th className="p-3.5 font-semibold">File Size</th>
                <th className="p-3.5 font-semibold">Created At</th>
                <th className="p-3.5 font-semibold">Triggered By</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {backups.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5">
                    <span className="font-bold text-foreground block">{b.backup_name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{b.filename}</span>
                  </td>
                  <td className="p-3.5">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {b.backup_type.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="p-3.5 font-mono text-foreground font-semibold">
                    {b.file_size_formatted || `${(b.file_size_bytes / (1024 * 1024)).toFixed(2)} MB`}
                  </td>
                  <td className="p-3.5 text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()}
                  </td>
                  <td className="p-3.5 font-mono text-foreground">{b.triggered_by}</td>
                  <td className="p-3.5">
                    <Badge
                      variant="outline"
                      className={
                        b.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]'
                          : b.status === 'in_progress'
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/30 text-[10px]'
                      }
                    >
                      {b.status}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setBackupToRestore(b)}
                        className="h-7 px-2 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                        title="Restore Database Snapshot"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        <span>Restore</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setBackupToDelete(b)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Delete Backup"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Trigger Backup Modal */}
      {isBackupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-base font-bold text-foreground mb-1">Create Database Backup</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Snapshot system state or export single-tenant configuration.
            </p>

            {errorMsg && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Backup Scope / Type</label>
                <select
                  value={backupType}
                  onChange={(e) => setBackupType(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                >
                  <option value="full_database">Full Platform Database Snapshot (PostgreSQL)</option>
                  <option value="tenant_data">Single-Tenant Partition JSON Export</option>
                  <option value="system_snapshot">Core Control Plane State</option>
                </select>
              </div>

              {backupType === 'tenant_data' ? (
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Select ISP Tenant to Export *</label>
                  <select
                    value={selectedTenant}
                    onChange={(e) => setSelectedTenant(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Snapshot Label / Remarks</label>
                  <Input
                    value={backupName}
                    onChange={(e) => setBackupName(e.target.value)}
                    placeholder="e.g. Pre-upgrade maintenance snapshot"
                    className="text-xs h-9"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBackupModalOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                >
                  {isSubmitting ? 'Starting Backup...' : 'Execute Backup'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        isOpen={!!backupToRestore}
        onClose={() => setBackupToRestore(null)}
        onConfirm={handleRestoreConfirm}
        isLoading={isRestoring}
        isDestructive={true}
        title={`RESTORE DATABASE SNAPSHOT: ${backupToRestore?.backup_name}?`}
        description="WARNING: Restoring a database snapshot will OVERWRITE current database state with the historical snapshot data. All operations will be reverted to this point in time."
        confirmText="Confirm Database Restoration"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!backupToDelete}
        onClose={() => setBackupToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        isDestructive={true}
        title={`Delete Backup Snapshot: ${backupToDelete?.backup_name}?`}
        description="This will permanently delete the snapshot archive from server storage."
        confirmText="Confirm Delete"
      />
    </div>
  );
}
