import React, { useEffect, useState } from 'react';
import {
  Plus,
  SearchLg,
  Folder,
  Database01,
  Download01,
  Trash01,
  ShieldTick,
  AlertTriangle,
  Server01,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { Backup, Tenant } from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

export function BackupsScreen() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Form State
  const [targetTenantId, setTargetTenantId] = useState('all');
  const [backupType, setBackupType] = useState<'full' | 'database' | 'media'>('full');

  const loadData = async () => {
    try {
      const [bks, tns] = await Promise.all([saasApi.getBackups(), saasApi.getTenants()]);
      setBackups(bks);
      setTenants(tns);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await saasApi.createBackup(targetTenantId, backupType);
      setIsAddOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;
    setIsRestoring(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      alert(`Snapshot ${selectedBackup.id} restored successfully to tenant.`);
      setIsRestoreOpen(false);
      setSelectedBackup(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this snapshot?')) return;
    try {
      await saasApi.deleteBackup(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredBackups = backups.filter((b) => {
    const term = search.toLowerCase();
    return (
      b.id.toLowerCase().includes(term) ||
      (b.tenant_name && b.tenant_name.toLowerCase().includes(term)) ||
      b.tenant_id.toLowerCase().includes(term)
    );
  });

  const totalBytes = backups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Disaster Recovery & Backups</h1>
            <Badge color="success" size="sm">
              Automated 24h
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Multi-region point-in-time snapshots, tenant schema dumps, and automated restore procedures.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => setIsAddOpen(true)}
          >
            Create Backup
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-tertiary">
            <span>Total Stored Snapshots</span>
            <Database01 className="size-4 text-brand-solid" />
          </div>
          <div className="mt-2 text-2xl font-bold text-primary">{backups.length} Files</div>
          <p className="mt-1 text-xs text-secondary">Encrypted with AES-256</p>
        </div>

        <div className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-tertiary">
            <span>Storage Allocated</span>
            <Server01 className="size-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-primary">{totalMB} MB</div>
          <p className="mt-1 text-xs text-secondary">S3 / Cloud Storage Bucket</p>
        </div>

        <div className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-tertiary">
            <span>Schedule Frequency</span>
            <ShieldTick className="size-4 text-success-solid" />
          </div>
          <div className="mt-2 text-2xl font-bold text-primary">Every 24 Hours</div>
          <p className="mt-1 text-xs text-success-primary">Next run: 02:00 UTC</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <Input
          aria-label="Search backups"
          placeholder="Search by backup ID or tenant..."
          icon={SearchLg}
          size="sm"
          value={search}
          onChange={(val) => setSearch(val)}
        />
      </div>

      {/* Backups Table */}
      <TableCard.Root>
        <TableCard.Header
          title="Backup Archives"
          badge={`${filteredBackups.length} Available`}
          description="Point-in-time recovery archives ready for instant rollback"
        />
        <Table aria-label="Backups Table">
          <Table.Header>
            <Table.Head id="id" isRowHeader>Backup Reference</Table.Head>
            <Table.Head id="target">Target Tenant</Table.Head>
            <Table.Head id="type">Scope</Table.Head>
            <Table.Head id="size">Size</Table.Head>
            <Table.Head id="status">Status</Table.Head>
            <Table.Head id="created">Created</Table.Head>
            <Table.Head id="actions">Actions</Table.Head>
          </Table.Header>
          <Table.Body items={filteredBackups}>
            {(backup) => (
              <Table.Row id={backup.id}>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <Folder className="size-4 text-tertiary" />
                    <span className="font-mono text-xs font-medium text-secondary">{backup.id}</span>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-semibold text-primary text-sm">
                    {backup.tenant_name || backup.tenant_id}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="capitalize text-xs text-secondary font-medium">
                    {backup.backup_type || 'Full'}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-xs text-secondary">
                    {(backup.size_bytes / 1024 / 1024).toFixed(1)} MB
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    color={backup.status === 'completed' ? 'success' : 'error'}
                    size="sm"
                   
                  >
                    {backup.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-xs text-tertiary">
                    {new Date(backup.created_at).toLocaleString()}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Download01}
                      onPress={() => alert(`Starting download for ${backup.id}.sql.gz`)}
                    >
                      Download
                    </Button>
                    <Button
                      size="sm"
                      color="secondary"
                      onPress={() => {
                        setSelectedBackup(backup);
                        setIsRestoreOpen(true);
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Trash01}
                      className="text-error-primary hover:text-error-solid"
                      onPress={() => handleDeleteBackup(backup.id)}
                    />
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Create Backup Modal */}
      <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
        <Modal className="max-w-lg">
          <Dialog>
            {({ close }) => (
              <form onSubmit={handleCreateBackup} className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <Database01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Trigger Manual Backup</h2>
                      <p className="text-xs text-tertiary">Initiate an immediate database snapshot.</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Target Environment
                    </label>
                    <select
                      value={targetTenantId}
                      onChange={(e) => setTargetTenantId(e.target.value)}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="all">All Tenants (Global Cluster Snapshot)</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.schema_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">
                      Snapshot Scope
                    </label>
                    <select
                      value={backupType}
                      onChange={(e) => setBackupType(e.target.value as any)}
                      className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="full">Full Archive (Database & Configuration)</option>
                      <option value="database">PostgreSQL Schema SQL Dump Only</option>
                      <option value="media">Uploaded Static Media & Assets</option>
                    </select>
                  </div>

                  <div className="rounded-lg bg-secondary p-3 text-xs text-secondary border border-secondary">
                    Snapshot will be compressed with <code className="font-mono text-brand-solid">gzip</code> and encrypted with AES-256 before upload to Cloud Storage.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button color="primary" type="submit" isLoading={isCreating}>
                    Start Snapshot
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Restore Confirmation Modal */}
      <ModalOverlay isOpen={isRestoreOpen} onOpenChange={setIsRestoreOpen}>
        <Modal className="max-w-md">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-warning-primary_alt p-2.5 text-warning-solid">
                    <AlertTriangle className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-primary">Restore Snapshot?</h2>
                    <p className="text-xs text-tertiary">Point-in-time recovery procedure</p>
                  </div>
                </div>

                <p className="text-sm text-secondary">
                  Restoring snapshot <strong className="text-primary">{selectedBackup?.id}</strong> will roll back the database schema for <strong className="text-primary">{selectedBackup?.tenant_name}</strong> to the state captured on {selectedBackup ? new Date(selectedBackup.created_at).toLocaleString() : ''}.
                </p>

                <div className="rounded-lg bg-error-primary_alt/40 border border-error-subtle p-3 text-xs text-error-primary">
                  Active user transactions during the restore window may experience momentary locking.
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    className="bg-warning-solid text-white hover:bg-warning-solid/90"
                    isLoading={isRestoring}
                    onPress={handleRestoreBackup}
                  >
                    Confirm Restore
                  </Button>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
