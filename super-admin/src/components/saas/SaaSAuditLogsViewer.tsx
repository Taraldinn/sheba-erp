'use client';

import React, { useState } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SaaSAuditLog } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface SaaSAuditLogsViewerProps {
  logs: SaaSAuditLog[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function SaaSAuditLogsViewer({
  logs,
  isLoading,
  onRefresh,
}: SaaSAuditLogsViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.actor_username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.tenant_name && log.tenant_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.ip_address && log.ip_address.includes(searchTerm));

    const matchesModule = moduleFilter === 'ALL' || log.module === moduleFilter;
    return matchesSearch && matchesModule;
  });

  const modules = Array.from(new Set(logs.map((l) => l.module).filter(Boolean)));

  const toggleExpand = (id: number) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search actor, action, tenant, or IP..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-card text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

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
      </div>

      {/* Logs Table */}
      {isLoading && logs.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Audit Logs Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Security events and administrative actions will stream here in real-time.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-3.5 font-semibold">Timestamp</th>
                <th className="p-3.5 font-semibold">Actor</th>
                <th className="p-3.5 font-semibold">Action</th>
                <th className="p-3.5 font-semibold">Module</th>
                <th className="p-3.5 font-semibold">Tenant Partition</th>
                <th className="p-3.5 font-semibold">IP Address</th>
                <th className="p-3.5 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => toggleExpand(log.id)}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-3.5 text-muted-foreground font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="p-3.5 font-bold text-foreground font-mono">
                        {log.actor_username}
                      </td>
                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px]">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-3.5 font-semibold text-foreground">{log.module}</td>
                      <td className="p-3.5">
                        {log.tenant_name ? (
                          <span className="font-semibold text-foreground">
                            {log.tenant_name} ({log.tenant_slug})
                          </span>
                        ) : (
                          <span className="text-violet-400 font-semibold">Control Plane</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-muted-foreground">
                        {log.ip_address || '—'}
                      </td>
                      <td className="p-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && log.details && (
                      <tr className="bg-muted/20">
                        <td colSpan={7} className="p-4 border-t border-border">
                          <div className="space-y-2">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              Payload Details:
                            </span>
                            <pre className="p-3 rounded-lg bg-card border border-border font-mono text-[11px] overflow-x-auto text-foreground">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
