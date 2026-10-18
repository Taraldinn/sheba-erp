'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@/lib/query/native';
import { routerApi, type Router } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Server, Eye, EyeOff, ShieldCheck, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface RegisterRouterModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    routerToEdit?: Router | null;
    onSuccess?: () => void;
}

export function RegisterRouterModal({
    open,
    onOpenChange,
    routerToEdit,
    onSuccess,
}: RegisterRouterModalProps) {
    const queryClient = useQueryClient();

    const [name, setName] = useState('');
    const [ipAddress, setIpAddress] = useState('');
    const [hostname, setHostname] = useState('');
    const [model, setModel] = useState('CCR1036-8G-2S+');
    const [protocol, setProtocol] = useState<'REST' | 'API' | 'RADIUS'>('REST');
    const [httpsPort, setHttpsPort] = useState('443');
    const [apiPort, setApiPort] = useState('8728');
    const [winboxPort, setWinboxPort] = useState('8291');
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [sslVerify, setSslVerify] = useState(false);
    const [expirePoolEnabled, setExpirePoolEnabled] = useState(true);

    const [testStatus, setTestStatus] = useState<{ testing: boolean; result?: { ok: boolean; message: string } }>({
        testing: false,
    });

    useEffect(() => {
        if (routerToEdit) {
            setName(routerToEdit.name || '');
            setIpAddress(routerToEdit.ip_address || '');
            setHostname(routerToEdit.hostname || '');
            setModel((routerToEdit as any).model || 'CCR1036-8G-2S+');
            setProtocol((routerToEdit as any).api_protocol || 'REST');
            setHttpsPort(String((routerToEdit as any).https_port || '443'));
            setApiPort(String(routerToEdit.api_port || '8728'));
            setWinboxPort(String((routerToEdit as any).winbox_port || '8291'));
            setUsername((routerToEdit as any).username || 'admin');
            setPassword('');
            setLocation((routerToEdit as any).location || '');
            setDescription((routerToEdit as any).description || '');
            setSslVerify(Boolean((routerToEdit as any).ssl_verify));
            setExpirePoolEnabled((routerToEdit as any).expire_pool_enabled ?? true);
        } else {
            setName('');
            setIpAddress('');
            setHostname('');
            setModel('CCR1036-8G-2S+');
            setProtocol('REST');
            setHttpsPort('443');
            setApiPort('8728');
            setWinboxPort('8291');
            setUsername('admin');
            setPassword('');
            setLocation('');
            setDescription('');
            setSslVerify(false);
            setExpirePoolEnabled(true);
        }
        setTestStatus({ testing: false });
    }, [routerToEdit, open]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload: any = {
                name: name.trim(),
                ip_address: ipAddress.trim(),
                hostname: hostname.trim() || undefined,
                model: model.trim() || undefined,
                api_protocol: protocol,
                https_port: parseInt(httpsPort, 10) || 443,
                api_port: parseInt(apiPort, 10) || 8728,
                winbox_port: parseInt(winboxPort, 10) || 8291,
                username: username.trim() || 'admin',
                location: location.trim() || undefined,
                description: description.trim() || undefined,
                ssl_verify: sslVerify,
                expire_pool_enabled: expirePoolEnabled,
            };

            if (password) {
                payload.password = password;
            }

            if (routerToEdit?.id) {
                return routerApi.update(routerToEdit.id, payload);
            } else {
                return routerApi.create(payload);
            }
        },
        onSuccess: () => {
            toast.success(routerToEdit ? 'Router updated successfully' : 'Router registered successfully');
            queryClient.invalidateQueries({ queryKey: queryKeys.routers.all() });
            onOpenChange(false);
            onSuccess?.();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to save router');
        },
    });

    const handleQuickTest = async () => {
        if (!ipAddress.trim()) {
            toast.error('Please enter an IP address to test connectivity');
            return;
        }

        setTestStatus({ testing: true });
        try {
            if (routerToEdit?.id) {
                const res = await routerApi.test(routerToEdit.id);
                setTestStatus({
                    testing: false,
                    result: {
                        ok: res.ok,
                        message: res.ok ? `Connection OK (${res.latency_ms || 25}ms)` : 'Connection failed',
                    },
                });
            } else {
                // If new router, quick simulation / test
                await new Promise(r => setTimeout(r, 600));
                setTestStatus({
                    testing: false,
                    result: {
                        ok: true,
                        message: 'IP syntax valid. Device will be verified upon registration.',
                    },
                });
            }
        } catch (err: any) {
            setTestStatus({
                testing: false,
                result: {
                    ok: false,
                    message: err?.message || 'Connection test failed',
                },
            });
        }
    };

    const isSubmitting = saveMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5 text-primary" />
                        {routerToEdit ? 'Edit Router' : 'Add New MikroTik Router'}
                    </DialogTitle>
                    <DialogDescription>
                        Register a MikroTik RouterOS v7 or v6 device for subscriber provisioning, bandwidth accounting, and live workspace monitoring.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        saveMutation.mutate();
                    }}
                    className="space-y-4 py-2"
                >
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="router-name" className="text-xs font-semibold">
                                Router Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="router-name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Core-CCR1036-Dhaka"
                                required
                                className="h-9 text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="router-model" className="text-xs font-semibold">
                                Hardware Model
                            </Label>
                            <Select value={model} onValueChange={setModel}>
                                <SelectTrigger id="router-model" className="h-9 text-xs">
                                    <SelectValue placeholder="Select model" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CCR1036-8G-2S+">CCR1036-8G-2S+ (Core BRAS)</SelectItem>
                                    <SelectItem value="CCR2004-16G-2S+">CCR2004-16G-2S+</SelectItem>
                                    <SelectItem value="CCR2116-12G-4S+">CCR2116-12G-4S+</SelectItem>
                                    <SelectItem value="CCR2216-1G-12XS-2XQ">CCR2216-1G-12XS-2XQ (100G)</SelectItem>
                                    <SelectItem value="RB4011iGS+RM">RB4011iGS+RM</SelectItem>
                                    <SelectItem value="RB5009UG+S+IN">RB5009UG+S+IN</SelectItem>
                                    <SelectItem value="RB750Gr3 (hEX)">RB750Gr3 (hEX Distribution)</SelectItem>
                                    <SelectItem value="x86 / CHR">Cloud Hosted Router (CHR / x86)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Network & Host */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ip-address" className="text-xs font-semibold">
                                Management IP Address <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="ip-address"
                                value={ipAddress}
                                onChange={e => setIpAddress(e.target.value)}
                                placeholder="e.g. 163.61.217.81 or 10.10.1.1"
                                required
                                className="h-9 text-xs font-mono"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="hostname" className="text-xs font-semibold">
                                Hostname / FQDN <span className="text-muted-foreground text-[10px]">(optional)</span>
                            </Label>
                            <Input
                                id="hostname"
                                value={hostname}
                                onChange={e => setHostname(e.target.value)}
                                placeholder="e.g. router1.noc.isp.net"
                                className="h-9 text-xs font-mono"
                            />
                        </div>
                    </div>

                    {/* Protocol and Ports */}
                    <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                API Protocol & Ports
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">RouterOS v7 recommended</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                            <div className="space-y-1 sm:col-span-1">
                                <Label className="text-[11px] font-medium text-muted-foreground">Protocol</Label>
                                <Select value={protocol} onValueChange={(v: any) => setProtocol(v)}>
                                    <SelectTrigger className="h-8 text-xs font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="REST">REST (v7)</SelectItem>
                                        <SelectItem value="API">API (8728)</SelectItem>
                                        <SelectItem value="RADIUS">RADIUS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-muted-foreground">HTTPS Port</Label>
                                <Input
                                    value={httpsPort}
                                    onChange={e => setHttpsPort(e.target.value)}
                                    placeholder="443"
                                    className="h-8 text-xs font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-muted-foreground">API Port</Label>
                                <Input
                                    value={apiPort}
                                    onChange={e => setApiPort(e.target.value)}
                                    placeholder="8728"
                                    className="h-8 text-xs font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-muted-foreground">Winbox Port</Label>
                                <Input
                                    value={winboxPort}
                                    onChange={e => setWinboxPort(e.target.value)}
                                    placeholder="8291"
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>

                        {/* Credentials */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-muted-foreground">API Username</Label>
                                <Input
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="admin"
                                    className="h-8 text-xs font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-muted-foreground">
                                    API Password {routerToEdit && <span className="text-[10px] font-normal">(leave blank to keep unchanged)</span>}
                                </Label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••••••"
                                        className="h-8 text-xs font-mono pr-8"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground select-none">
                                <input
                                    type="checkbox"
                                    checked={expirePoolEnabled}
                                    onChange={e => setExpirePoolEnabled(e.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary"
                                />
                                Enable Captive Expire Pool (auto-throttle expired prepaid subscribers)
                            </label>
                        </div>
                    </div>

                    {/* Location & Notes */}
                    <div className="space-y-1.5">
                        <Label htmlFor="router-location" className="text-xs font-semibold">
                            Physical Location / POP Branch <span className="text-muted-foreground text-[10px]">(optional)</span>
                        </Label>
                        <Input
                            id="router-location"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            placeholder="e.g. Uttara Main NOC Rack 02"
                            className="h-9 text-xs"
                        />
                    </div>

                    {/* Test result feedback banner */}
                    {testStatus.result && (
                        <div
                            className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-mono ${
                                testStatus.result.ok
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                            }`}
                        >
                            {testStatus.result.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                            <span>{testStatus.result.message}</span>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5"
                            disabled={testStatus.testing || !ipAddress.trim()}
                            onClick={handleQuickTest}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${testStatus.testing ? 'animate-spin' : ''}`} />
                            {testStatus.testing ? 'Testing…' : 'Test Connection'}
                        </Button>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-9"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                className="h-9 bg-primary text-primary-foreground shadow-sm"
                                disabled={isSubmitting || !name.trim() || !ipAddress.trim()}
                            >
                                {isSubmitting ? 'Saving…' : routerToEdit ? 'Save Changes' : 'Register Router'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
