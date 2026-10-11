'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, StatusBadge, ErrorAlert } from '@/components/feedback';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';

export default function KillSwitchPage() {
    const queryClient = useQueryClient();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [reason, setReason] = useState('');

    const stateQuery = useQuery({
        queryKey: ['platform-admin', 'kill-switch'],
        queryFn: () => platformAdminApi.getKillSwitchState(),
        refetchInterval: 10000,
    });

    const isEngaged = Boolean(stateQuery.data?.engaged);

    const toggleMutation = useMutation({
        mutationFn: async ({ engaged, reason }: { engaged: boolean; reason: string }) => {
            return platformAdminApi.toggleKillSwitch(engaged, reason);
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['platform-admin', 'kill-switch'] });
            queryClient.invalidateQueries({ queryKey: ['platform-admin', 'health', 'deep'] });
            setConfirmOpen(false);
            setReason('');
            if (data.engaged) {
                toast.error('Global Platform Write-Lock ENGAGED. All mutation endpoints paused.');
            } else {
                toast.success('Global Platform Write-Lock RELEASED. Normal traffic resumed.');
            }
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to toggle kill switch. OWNER role required.');
        },
    });

    const handleConfirm = () => {
        toggleMutation.mutate({
            engaged: !isEngaged,
            reason: reason.trim() || (isEngaged ? 'Manual release by Platform Owner' : 'Emergency incident lock'),
        });
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Emergency Kill Switch"
                description="Global platform write-lock control. Pauses mutation traffic during critical incidents while preserving read access."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stateQuery.refetch()}
                        disabled={stateQuery.isFetching}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${stateQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh State
                    </Button>
                }
            />

            {stateQuery.isError && (
                <ErrorAlert
                    title="Failed to load kill-switch state"
                    message={String((stateQuery.error as Error)?.message || stateQuery.error)}
                />
            )}

            <div className="grid gap-6 md:grid-cols-2">
                <Card className={isEngaged ? 'border-destructive bg-destructive/5' : 'border-border'}>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                {isEngaged ? (
                                    <>
                                        <ShieldAlert className="h-5 w-5 text-destructive" />
                                        <span>Status: WRITE-LOCK ENGAGED</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                        <span>Status: Normal Operations</span>
                                    </>
                                )}
                            </CardTitle>
                            <StatusBadge
                                status={isEngaged ? 'critical' : 'active'}
                                label={isEngaged ? 'LOCKED' : 'ONLINE'}
                            />
                        </div>
                        <CardDescription>
                            {isEngaged
                                ? 'All write operations across the SaaS control plane are currently intercepted and rejected.'
                                : 'All SaaS and tenant control-plane write operations are running normally.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        {isEngaged && (
                            <div className="rounded-lg bg-destructive/10 p-4 text-destructive space-y-1">
                                <div className="font-semibold flex items-center gap-1.5">
                                    <AlertTriangle className="h-4 w-4" />
                                    Active Incident Lock Details
                                </div>
                                <p><strong>Engaged By:</strong> {stateQuery.data?.set_by || 'Unknown'}</p>
                                <p><strong>Reason:</strong> {stateQuery.data?.reason || 'No reason provided'}</p>
                                <p><strong>Engaged At:</strong> {stateQuery.data?.set_at ? new Date(stateQuery.data.set_at).toLocaleString() : 'N/A'}</p>
                            </div>
                        )}

                        <div className="pt-2">
                            <Button
                                variant={isEngaged ? 'default' : 'destructive'}
                                size="lg"
                                className="w-full font-semibold"
                                onClick={() => setConfirmOpen(true)}
                                disabled={toggleMutation.isPending || stateQuery.isLoading}
                            >
                                {isEngaged ? 'Disengage Write-Lock (Resume Traffic)' : 'Engage Emergency Write-Lock'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Operational Safeguards</CardTitle>
                        <CardDescription>How the emergency write-lock behaves</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                <strong>Role Gate:</strong> Only operators with the <code>OWNER</code> platform role can engage or release this lock.
                            </li>
                            <li>
                                <strong>Read Traffic Intact:</strong> Status dashboards, tenant telemetry, read-only audit exports, and health probes remain fully functional.
                            </li>
                            <li>
                                <strong>Audit Trail:</strong> Every toggle action is recorded immutably in the central <code>AuditLog</code> with operator ID, IP address, and rationale.
                            </li>
                            <li>
                                <strong>Idempotent:</strong> Engaging an already-locked platform refreshes metadata without disrupting ongoing recovery procedures.
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {isEngaged ? 'Confirm Write-Lock Release' : 'Confirm Emergency Write-Lock Activation'}
                        </DialogTitle>
                        <DialogDescription>
                            {isEngaged
                                ? 'Are you sure you want to restore write permissions for all tenants and SaaS modules?'
                                : 'Activating this lock will immediately reject incoming POST, PUT, PATCH, and DELETE requests across the control plane.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-2">
                        <Label htmlFor="lock-reason">Incident Rationale / Reason</Label>
                        <Input
                            id="lock-reason"
                            placeholder={isEngaged ? 'e.g. Migration complete, database back online' : 'e.g. Investigating unexpected billing anomaly'}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant={isEngaged ? 'default' : 'destructive'}
                            onClick={handleConfirm}
                            disabled={toggleMutation.isPending}
                        >
                            {toggleMutation.isPending ? 'Processing...' : (isEngaged ? 'Release Lock' : 'Engage Lock')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
