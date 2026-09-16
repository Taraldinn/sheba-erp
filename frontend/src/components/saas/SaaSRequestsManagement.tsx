'use client';

import React, { useState } from 'react';
import {
  Inbox,
  User,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Check,
  X,
} from 'lucide-react';
import { TenantOnboardingRequest } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSRequestsManagementProps {
  requests: TenantOnboardingRequest[];
  isLoading: boolean;
  onRefresh: () => void;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string, reason: string) => Promise<void>;
}

export function SaaSRequestsManagement({
  requests,
  isLoading,
  onRefresh,
  onApprove,
  onReject,
}: SaaSRequestsManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');

  const [requestToApprove, setRequestToApprove] = useState<TenantOnboardingRequest | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const [requestToReject, setRequestToReject] = useState<TenantOnboardingRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.organization_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.contact_email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApproveConfirm = async () => {
    if (!requestToApprove) return;
    setIsApproving(true);
    try {
      await onApprove(requestToApprove.id);
      setRequestToApprove(null);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!requestToReject) return;
    setIsRejecting(true);
    try {
      await onReject(requestToReject.id, rejectionReason);
      setRequestToReject(null);
      setRejectionReason('');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search request by company, contact, or email..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-card text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="pending">Pending Review</option>
            <option value="approved">Approved & Provisioned</option>
            <option value="rejected">Rejected</option>
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

      {/* Requests List */}
      {isLoading && requests.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Onboarding Requests</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {statusFilter === 'pending'
              ? 'There are currently no pending ISP signup requests awaiting review.'
              : 'No requests matched the specified filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredRequests.map((req) => (
            <div
              key={req.id}
              className="p-4 bg-card rounded-xl border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-violet-500/40 transition-colors"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-foreground">{req.organization_name}</h4>
                  <Badge
                    variant="outline"
                    className={
                      req.status === 'pending'
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]'
                        : req.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]'
                        : 'bg-rose-500/10 text-rose-500 border-rose-500/30 text-[10px]'
                    }
                  >
                    {req.status === 'pending'
                      ? 'Pending Approval'
                      : req.status === 'approved'
                      ? 'Approved'
                      : 'Rejected'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-border">
                    {req.plan} Plan
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-mono">
                    Slug: <strong className="text-foreground">{req.desired_slug}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    <span>{req.contact_name}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{req.contact_email}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{req.contact_phone}</span>
                  </span>
                </div>

                {req.rejection_reason && (
                  <p className="text-[11px] text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded inline-block mt-1">
                    Rejection note: {req.rejection_reason}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              {req.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => setRequestToApprove(req)}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve & Provision</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRequestToReject(req)}
                    className="text-xs text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approve Confirmation Modal */}
      <ConfirmModal
        isOpen={!!requestToApprove}
        onClose={() => setRequestToApprove(null)}
        onConfirm={handleApproveConfirm}
        isLoading={isApproving}
        isDestructive={false}
        title={`Approve & Provision ${requestToApprove?.organization_name}?`}
        description={`Approving this onboarding request will immediately create the tenant partition for "${requestToApprove?.desired_slug}", provision the initial administrator account, create the licensing subscription, and send credentials to ${requestToApprove?.contact_email}.`}
        confirmText="Confirm & Auto-Provision"
      />

      {/* Reject Modal */}
      {requestToReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-base font-bold text-foreground mb-1">
              Reject Onboarding Request
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Rejecting request for {requestToReject.organization_name}. Please provide a reason.
            </p>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Rejection Reason</label>
                <Input
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Duplicate registration or invalid contact info..."
                  className="text-xs h-9"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRequestToReject(null)}
                  disabled={isRejecting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleRejectConfirm}
                  disabled={isRejecting}
                  className="text-xs font-semibold"
                >
                  {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
