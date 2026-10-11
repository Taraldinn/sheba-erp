'use client';

import { useState, useEffect } from 'react';
import { storage, STORAGE_KEYS, platformAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ShieldAlert, StopCircle } from 'lucide-react';
import { toast } from 'sonner';

export function ImpersonationBanner() {
    const [impersonatingTenant, setImpersonatingTenant] = useState<string | null>(null);
    const [stopping, setStopping] = useState(false);

    useEffect(() => {
        const tenant = storage.get(STORAGE_KEYS.impersonatingTenant);
        setImpersonatingTenant(tenant);
    }, []);

    if (!impersonatingTenant) return null;

    const handleStop = async () => {
        setStopping(true);
        try {
            await platformAdminApi.stopImpersonation(impersonatingTenant);
            storage.remove(STORAGE_KEYS.impersonatingTenant);
            setImpersonatingTenant(null);
            toast.success(`Impersonation session for ${impersonatingTenant} terminated.`);
            window.location.reload();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to stop impersonation');
            setStopping(false);
        }
    };

    return (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between text-xs font-medium shadow-sm transition-all animate-in slide-in-from-top">
            <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>
                    <strong>SECURITY AUDIT:</strong> You are actively impersonating tenant{' '}
                    <span className="underline font-bold">{impersonatingTenant}</span>. All actions are immutably logged with your operator ID.
                </span>
            </div>
            <Button
                variant="secondary"
                size="sm"
                className="h-7 px-3 text-xs font-semibold bg-background text-foreground hover:bg-background/90"
                onClick={handleStop}
                disabled={stopping}
            >
                <StopCircle className="mr-1.5 h-3.5 w-3.5 text-destructive" />
                {stopping ? 'Stopping...' : 'Stop Impersonation'}
            </Button>
        </div>
    );
}
