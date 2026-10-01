import React, { useEffect, useState } from 'react';
import {
  SearchLg,
  Eye,
  Download01,
  Copy01,
  User01,
  Code01,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { AuditLog } from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

export function AuditLogsScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [actionCategory, setActionCategory] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const loadLogs = async () => {
    try {
      const data = await saasApi.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleExport = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saas-audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter((log) => {
    const term = search.toLowerCase();
    const matchesSearch =
      log.action.toLowerCase().includes(term) ||
      log.user_id.toLowerCase().includes(term) ||
      (log.tenant_id && log.tenant_id.toLowerCase().includes(term)) ||
      JSON.stringify(log.details).toLowerCase().includes(term);

    if (!matchesSearch) return false;
    if (actionCategory !== 'all') {
      return log.action.startsWith(actionCategory);
    }
    return true;
  });

  const getActionBadgeColor = (action: string) => {
    if (action.includes('created') || action.includes('provisioned') || action.includes('succeeded') || action.includes('verified')) {
      return 'success';
    }
    if (action.includes('suspended') || action.includes('deleted') || action.includes('rejected') || action.includes('failed')) {
      return 'error';
    }
    if (action.includes('updated') || action.includes('canceled')) {
      return 'warning';
    }
    return 'brand';
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Security & Audit Logs</h1>
            <Badge color="brand" size="sm">
              Immutable Trail
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Detailed ledger of administrative events, tenant modifications, and security actions.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center gap-2">
          <Button
            color="secondary"
            size="md"
            iconLeading={Download01}
            onPress={handleExport}
          >
            Export JSON
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <div className="w-full sm:w-80">
          <Input
            aria-label="Search logs"
            placeholder="Search action, actor email, payload..."
            icon={SearchLg}
            size="sm"
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-medium text-tertiary">Module:</span>
          {[
            { id: 'all', label: 'All Events' },
            { id: 'tenant', label: 'Tenants' },
            { id: 'domain', label: 'Domains' },
            { id: 'backup', label: 'Backups' },
            { id: 'subscription', label: 'Billing' },
            { id: 'onboarding', label: 'Onboarding' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActionCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                actionCategory === cat.id
                  ? 'bg-brand-primary_alt text-brand-secondary ring-1 ring-brand'
                  : 'text-tertiary hover:bg-secondary'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Logs Table */}
      <TableCard.Root>
        <TableCard.Header
          title="System Audit Records"
          badge={`${filteredLogs.length} Events`}
          description="Tamper-evident logs recorded across control plane microservices"
        />
        <Table aria-label="Audit Logs Table">
          <Table.Header>
            <Table.Head id="action" isRowHeader>Event / Action</Table.Head>
            <Table.Head id="user">Actor User</Table.Head>
            <Table.Head id="tenant">Target Tenant</Table.Head>
            <Table.Head id="ip">Source IP</Table.Head>
            <Table.Head id="date">Timestamp</Table.Head>
            <Table.Head id="actions">Inspection</Table.Head>
          </Table.Header>
          <Table.Body items={filteredLogs}>
            {(log) => (
              <Table.Row id={log.id}>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <Badge color={getActionBadgeColor(log.action)} size="sm">
                      {log.action}
                    </Badge>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1.5 text-xs text-secondary font-medium">
                    <User01 className="size-3.5 text-tertiary" />
                    <span>{log.user_id}</span>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-xs text-tertiary">
                    {log.tenant_id || 'System Global'}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-xs text-secondary">
                    {log.ip_address || '127.0.0.1'}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-xs text-tertiary">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Button
                    size="sm"
                    color="secondary"
                    iconLeading={Eye}
                    onPress={() => {
                      setSelectedLog(log);
                      setIsDetailOpen(true);
                    }}
                  >
                    View Details
                  </Button>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Log Detail Modal */}
      <ModalOverlay isOpen={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <Modal className="max-w-xl">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <Code01 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Audit Log Event Payload</h2>
                      <p className="text-xs text-tertiary">{selectedLog?.id}</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                {selectedLog && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-xs bg-secondary p-3.5 rounded-xl border border-secondary">
                      <div>
                        <span className="text-tertiary">Action:</span>
                        <div className="font-semibold text-primary mt-0.5">{selectedLog.action}</div>
                      </div>
                      <div>
                        <span className="text-tertiary">Actor:</span>
                        <div className="font-semibold text-primary mt-0.5">{selectedLog.user_id}</div>
                      </div>
                      <div>
                        <span className="text-tertiary">Source IP:</span>
                        <div className="font-mono text-secondary mt-0.5">{selectedLog.ip_address || '127.0.0.1'}</div>
                      </div>
                      <div>
                        <span className="text-tertiary">Time (UTC):</span>
                        <div className="text-secondary mt-0.5">{new Date(selectedLog.created_at).toISOString()}</div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-tertiary">Context Payload (JSON)</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(selectedLog.details, null, 2));
                            alert('Copied JSON payload');
                          }}
                          className="inline-flex items-center gap-1 text-xs text-brand-solid hover:underline"
                        >
                          <Copy01 className="size-3" /> Copy
                        </button>
                      </div>
                      <pre className="p-4 rounded-xl bg-gray-950 text-gray-100 font-mono text-xs overflow-x-auto border border-gray-800 leading-relaxed">
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Close
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
