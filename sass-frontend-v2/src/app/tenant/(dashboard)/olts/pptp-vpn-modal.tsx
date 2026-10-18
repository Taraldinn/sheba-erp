'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@/lib/query/native';
import { pptpVpnApi, type PptpVpnConfig } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, X } from 'lucide-react';
import { toast } from 'sonner';

interface PptpVpnModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentConfig?: PptpVpnConfig | null;
    onSuccess: () => void;
}

export function PptpVpnModal({
    open,
    onOpenChange,
    currentConfig,
    onSuccess,
}: PptpVpnModalProps) {
    const [serverIp, setServerIp] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [lanSubnet, setLanSubnet] = useState('172.25.31.0/24');
    const [requireMppe, setRequireMppe] = useState(true);
    const [autoConnect, setAutoConnect] = useState(true);
    const [routeMetric, setRouteMetric] = useState('50');

    useEffect(() => {
        if (currentConfig) {
            setServerIp(currentConfig.server_ip || '');
            setUsername(currentConfig.username || '');
            setPassword('');
            setLanSubnet(currentConfig.lan_subnet || '172.25.31.0/24');
            setRequireMppe(currentConfig.require_mppe ?? true);
            setAutoConnect(currentConfig.auto_connect ?? true);
            setRouteMetric(String(currentConfig.route_metric || 50));
        } else {
            setServerIp('');
            setUsername('');
            setPassword('');
            setLanSubnet('172.25.31.0/24');
            setRequireMppe(true);
            setAutoConnect(true);
            setRouteMetric('50');
        }
    }, [currentConfig, open]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload: Record<string, any> = {
                server_ip: serverIp.trim(),
                username: username.trim(),
                lan_subnet: lanSubnet.trim(),
                require_mppe: requireMppe,
                auto_connect: autoConnect,
                route_metric: parseInt(routeMetric, 10) || 50,
            };
            if (password.trim()) {
                payload.password = password.trim();
            }
            return await pptpVpnApi.save(payload);
        },
        onSuccess: () => {
            toast.success('PPTP VPN settings saved successfully!');
            onSuccess();
            onOpenChange(false);
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to save PPTP VPN settings.');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveMutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 rounded-xl bg-card border border-border shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 sticky top-0 z-10">
                    <div className="flex items-center gap-2.5 font-semibold text-lg">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 flex items-center justify-center">
                            <Settings className="w-4 h-4 text-primary" />
                        </div>
                        <DialogTitle className="text-base font-semibold text-foreground">
                            Configure PPTP VPN Settings
                        </DialogTitle>
                    </div>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* PPTP VPN Server Address / IP */}
                    <div>
                        <Label className="text-xs font-semibold text-foreground">
                            PPTP VPN Server Address / IP
                        </Label>
                        <Input
                            value={serverIp}
                            onChange={(e) => setServerIp(e.target.value)}
                            placeholder="e.g. 163.61.217.81"
                            className="mt-1 text-sm h-10"
                        />
                    </div>

                    {/* VPN Username */}
                    <div>
                        <Label className="text-xs font-semibold text-foreground">
                            VPN Username
                        </Label>
                        <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="e.g. ashik"
                            className="mt-1 text-sm h-10"
                        />
                    </div>

                    {/* VPN Password */}
                    <div>
                        <Label className="text-xs font-semibold text-foreground">
                            VPN Password
                        </Label>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={currentConfig?.has_password ? '•••••••• (leave blank to keep current)' : 'Enter PPTP password'}
                            className="mt-1 text-sm h-10"
                        />
                    </div>

                    {/* Bangladeshi OLT LAN Subnet */}
                    <div>
                        <Label className="text-xs font-semibold text-foreground">
                            Bangladeshi OLT LAN Subnet
                        </Label>
                        <Input
                            value={lanSubnet}
                            onChange={(e) => setLanSubnet(e.target.value)}
                            placeholder="e.g. 172.25.31.0/24"
                            className="mt-1 text-sm h-10"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            The LAN subnet where the remote OLT devices reside in Bangladesh.
                        </p>
                    </div>

                    {/* Toggle: Require MPPE Encryption */}
                    <div className="flex items-start justify-between gap-4 py-2 border-t border-border">
                        <div className="space-y-0.5">
                            <span className="text-xs font-semibold text-foreground block">
                                Require MPPE Encryption
                            </span>
                            <p className="text-[11px] text-muted-foreground">
                                Disable this if your VPN server refuses MPPE encryption or fails to negotiate.
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                            <input
                                type="checkbox"
                                checked={requireMppe}
                                onChange={(e) => setRequireMppe(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-10 h-5.5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-primary border border-border"></div>
                        </label>
                    </div>

                    {/* Row: Auto-connect / Auto-reconnect + Route Metric */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center py-2 border-t border-border">
                        <div className="md:col-span-2 flex items-start justify-between gap-3">
                            <div className="space-y-0.5">
                                <span className="text-xs font-semibold text-foreground block">
                                    Auto-connect / Auto-reconnect
                                </span>
                                <p className="text-[11px] text-muted-foreground">
                                    The master VPN cron keeps this tenant tunnel available for OLT polling.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                                <input
                                    type="checkbox"
                                    checked={autoConnect}
                                    onChange={(e) => setAutoConnect(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-10 h-5.5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-primary border border-border"></div>
                            </label>
                        </div>
                        <div>
                            <Label className="text-xs font-semibold text-foreground">Route Metric</Label>
                            <Input
                                type="number"
                                value={routeMetric}
                                onChange={(e) => setRouteMetric(e.target.value)}
                                placeholder="50"
                                className="mt-1 text-sm h-10"
                            />
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="border-border text-foreground hover:bg-muted h-10 px-5"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={saveMutation.isPending}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-10 px-6 shadow-xs"
                        >
                            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
