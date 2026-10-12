'use client';

import { useEffect, useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { OrganizationSummary, Tenant } from '@/lib/api/types';

interface MoveTenantDialogProps {
    tenant: Tenant | null;
    organizations: OrganizationSummary[];
    onOpenChange: (open: boolean) => void;
    onSubmit: (organizationId: string | null) => Promise<unknown>;
}

const UNASSIGNED = '__null__';

export function MoveTenantDialog({ tenant, organizations, onOpenChange, onSubmit }: MoveTenantDialogProps) {
    const [orgId, setOrgId] = useState<string>(UNASSIGNED);
    const [pending, startTransition] = useTransition();
    const selectId = useId();

    useEffect(() => {
        if (tenant) {
            setOrgId(tenant.organization_id ?? UNASSIGNED);
        }
    }, [tenant]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!tenant) return;
        const value = orgId === UNASSIGNED ? null : orgId;
        startTransition(async () => {
            await onSubmit(value);
        });
    };

    return (
        <Dialog open={Boolean(tenant)} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Move {tenant?.name ?? 'tenant'} to an organization</DialogTitle>
                    <DialogDescription>
                        Reassign this tenant to a different organization. Pick <strong>Unassigned</strong> to detach it
                        (e.g. for the legacy auto-migration backfill).
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1">
                        <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
                            Organization
                        </label>
                        <Select value={orgId} onValueChange={setOrgId}>
                            <SelectTrigger id={selectId}>
                                <SelectValue placeholder="Select organization" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                                {organizations.map(o => (
                                    <SelectItem key={o.id} value={o.id}>
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending || !tenant}>
                            {pending ? 'Moving…' : 'Move tenant'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
