import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  SearchLg,
  Eye,
  Mail01,
  Phone01,
  Building07,
} from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { OnboardingRequest } from '@/api/types';
import { Table, TableCard } from '@/components/application/table/table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

export function OnboardingScreen() {
  const [requests, setRequests] = useState<OnboardingRequest[]>([]);
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<OnboardingRequest | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      const data = await saasApi.getOnboardingRequests();
      setRequests(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await saasApi.approveOnboarding(id);
      await loadRequests();
      if (selectedRequest?.id === id) {
        setIsReviewOpen(false);
        setSelectedRequest(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    try {
      await saasApi.rejectOnboarding(selectedRequest.id, rejectReason);
      setIsRejectOpen(false);
      setIsReviewOpen(false);
      setSelectedRequest(null);
      setRejectReason('');
      await loadRequests();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.company_name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusTab !== 'all' && r.status !== statusTab) return false;
    return true;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">Onboarding Requests</h1>
            {pendingCount > 0 && (
              <Badge color="warning" size="sm">
                {pendingCount} Pending Review
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Review customer registration inquiries, approve schema creation, or decline requests.
          </p>
        </div>
      </div>

      {/* Status Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary p-4 rounded-xl border border-secondary shadow-xs">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => {
            const count = tab === 'all' ? requests.length : requests.filter((r) => r.status === tab).length;
            return (
              <button
                key={tab}
                onClick={() => setStatusTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  statusTab === tab
                    ? 'bg-brand-primary_alt text-brand-secondary ring-1 ring-brand'
                    : 'text-tertiary hover:bg-secondary'
                }`}
              >
                <span>{tab}</span>
                <span className="text-[11px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-80">
          <Input
            aria-label="Search requests"
            placeholder="Search company or email..."
            icon={SearchLg}
            size="sm"
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>
      </div>

      {/* Table */}
      <TableCard.Root>
        <TableCard.Header
          title="Applications"
          badge={`${filteredRequests.length} Showing`}
          description="Inbound self-serve registration applications"
        />
        <Table aria-label="Onboarding Requests Table">
          <Table.Header>
            <Table.Head id="company" isRowHeader>Company Name</Table.Head>
            <Table.Head id="contact">Contact Information</Table.Head>
            <Table.Head id="plan">Requested Plan</Table.Head>
            <Table.Head id="status">Status</Table.Head>
            <Table.Head id="date">Submitted</Table.Head>
            <Table.Head id="actions">Actions</Table.Head>
          </Table.Header>
          <Table.Body items={filteredRequests}>
            {(req) => (
              <Table.Row id={req.id}>
                <Table.Cell>
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-brand-primary_alt flex items-center justify-center text-brand-solid font-bold">
                      <Building07 className="size-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-primary">{req.company_name}</div>
                      {req.notes && (
                        <div className="text-xs text-tertiary truncate max-w-[200px]" title={req.notes}>
                          {req.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center gap-1 text-secondary font-medium">
                      <Mail01 className="size-3.5 text-quaternary" /> {req.email}
                    </div>
                    {req.phone && (
                      <div className="flex items-center gap-1 text-tertiary">
                        <Phone01 className="size-3.5 text-quaternary" /> {req.phone}
                      </div>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge color="gray" size="sm">
                    {req.plan_requested || 'Starter Tier'}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    color={
                      req.status === 'approved'
                        ? 'success'
                        : req.status === 'rejected'
                        ? 'error'
                        : 'warning'
                    }
                    size="sm"
                   
                  >
                    {req.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-xs text-tertiary">
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Eye}
                      onPress={() => {
                        setSelectedRequest(req);
                        setIsReviewOpen(true);
                      }}
                    >
                      Review
                    </Button>
                    {req.status === 'pending' && (
                      <Button
                        size="sm"
                        color="primary"
                        iconLeading={CheckCircle}
                        isLoading={approvingId === req.id}
                        onPress={() => handleApprove(req.id)}
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </TableCard.Root>

      {/* Review Modal */}
      <ModalOverlay isOpen={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <Modal className="max-w-xl">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-secondary pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
                      <Building07 className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Application Review</h2>
                      <p className="text-xs text-tertiary">{selectedRequest?.company_name}</p>
                    </div>
                  </div>
                  <CloseButton onPress={close} />
                </div>

                {selectedRequest && (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4 bg-secondary p-4 rounded-xl border border-secondary">
                      <div>
                        <span className="text-xs text-tertiary">Company</span>
                        <div className="font-semibold text-primary">{selectedRequest.company_name}</div>
                      </div>
                      <div>
                        <span className="text-xs text-tertiary">Requested Plan</span>
                        <div className="font-semibold text-brand-solid">{selectedRequest.plan_requested || 'Starter Tier'}</div>
                      </div>
                      <div>
                        <span className="text-xs text-tertiary">Email</span>
                        <div className="font-medium text-secondary">{selectedRequest.email}</div>
                      </div>
                      <div>
                        <span className="text-xs text-tertiary">Phone Number</span>
                        <div className="font-medium text-secondary">{selectedRequest.phone || 'N/A'}</div>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-tertiary">Application Notes & Requirements</span>
                      <div className="mt-1 p-3 rounded-lg border border-secondary bg-primary text-secondary text-xs leading-relaxed">
                        {selectedRequest.notes || 'No special instructions submitted.'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-quaternary">
                        Status: <strong className="capitalize text-primary">{selectedRequest.status}</strong>
                      </span>
                      <span className="text-xs text-quaternary">
                        Submitted: {new Date(selectedRequest.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Close
                  </Button>
                  {selectedRequest?.status === 'pending' && (
                    <>
                      <Button
                        color="secondary"
                        className="text-error-primary hover:text-error-solid"
                        onPress={() => setIsRejectOpen(true)}
                      >
                        Decline
                      </Button>
                      <Button
                        color="primary"
                        iconLeading={CheckCircle}
                        isLoading={approvingId === selectedRequest.id}
                        onPress={() => handleApprove(selectedRequest.id)}
                      >
                        Approve & Provision
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Reject Confirmation Modal */}
      <ModalOverlay isOpen={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <Modal className="max-w-md">
          <Dialog>
            {({ close }) => (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-error-primary_alt p-2 text-error-solid">
                    <XCircle className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-primary">Reject Application?</h2>
                    <p className="text-xs text-tertiary">Decline onboarding for {selectedRequest?.company_name}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1">
                    Rejection Reason
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Incomplete compliance documentation..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full rounded-lg border border-secondary bg-primary p-2.5 text-xs text-primary shadow-xs outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-secondary">
                  <Button color="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    className="bg-error-solid hover:bg-error-solid/90 text-white"
                    onPress={handleReject}
                  >
                    Confirm Rejection
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
