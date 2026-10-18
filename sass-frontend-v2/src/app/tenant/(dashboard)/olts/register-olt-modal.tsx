'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@/lib/query/native';
import { oltApi, type Olt } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PlusCircle, Globe, KeyRound, X } from 'lucide-react';
import { toast } from 'sonner';

interface RegisterOltModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    oltToEdit?: Olt | null;
    onSuccess: () => void;
}

export function RegisterOltModal({
    open,
    onOpenChange,
    oltToEdit,
    onSuccess,
}: RegisterOltModalProps) {
    const [name, setName] = useState('');
    const [latlong, setLatlong] = useState('23.8103,90.4125');
    const [brandTech, setBrandTech] = useState('BDCOM EPON');
    const [accessMode, setAccessMode] = useState('Telnet Mode');
    const [connectionPath, setConnectionPath] = useState('Direct OLT IP');
    const [ipAddress, setIpAddress] = useState('');
    const [telnetPort, setTelnetPort] = useState('23');

    // Access Credentials
    const [telnetUser, setTelnetUser] = useState('admin');
    const [telnetPassword, setTelnetPassword] = useState('');
    const [snmpCommunity, setSnmpCommunity] = useState('public');
    const [snmpPort, setSnmpPort] = useState('161');
    const [retries, setRetries] = useState('1');
    const [timeoutVal, setTimeoutVal] = useState('10');
    const [pollInterval, setPollInterval] = useState('600');

    // Dual Mode Box
    const [dualMode, setDualMode] = useState(true);
    const [enablePassword, setEnablePassword] = useState('');
    const [cliTimeout, setCliTimeout] = useState('5');

    useEffect(() => {
        if (oltToEdit) {
            setName(oltToEdit.name || '');
            setLatlong(oltToEdit.lat_long || (oltToEdit.latitude && oltToEdit.longitude ? `${oltToEdit.latitude},${oltToEdit.longitude}` : '23.8103,90.4125'));
            const b = oltToEdit.brand || 'BDCOM';
            const m = oltToEdit.access_mode || 'EPON';
            setBrandTech(`${b} ${m}`);
            setAccessMode(oltToEdit.cli_access_mode || 'Telnet Mode');
            setConnectionPath(oltToEdit.connection_path || 'Direct OLT IP');
            setIpAddress(oltToEdit.ip_address || '');
            setTelnetPort(String(oltToEdit.telnet_port || 23));
            setTelnetUser(oltToEdit.telnet_user || 'admin');
            setSnmpPort(String(oltToEdit.snmp_port || 161));
            setRetries(String(oltToEdit.snmp_retries || 1));
            setTimeoutVal(String(oltToEdit.snmp_timeout || 10));
            setPollInterval(String(oltToEdit.poll_interval || 600));
            setDualMode(Boolean(oltToEdit.cli_enabled ?? true));
            setCliTimeout(String(oltToEdit.cli_timeout || 5));
        } else {
            setName('');
            setLatlong('23.8103,90.4125');
            setBrandTech('BDCOM EPON');
            setAccessMode('Telnet Mode');
            setConnectionPath('Direct OLT IP');
            setIpAddress('');
            setTelnetPort('23');
            setTelnetUser('admin');
            setTelnetPassword('');
            setSnmpCommunity('public');
            setSnmpPort('161');
            setRetries('1');
            setTimeoutVal('10');
            setPollInterval('600');
            setDualMode(true);
            setEnablePassword('');
            setCliTimeout('5');
        }
    }, [oltToEdit, open]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const parts = brandTech.split(' ');
            const brand = parts[0] || 'BDCOM';
            const tech = parts[1] || 'EPON';

            const payload: Record<string, any> = {
                name: name.trim(),
                lat_long: latlong.trim(),
                brand,
                access_mode: tech,
                cli_access_mode: accessMode,
                connection_path: connectionPath,
                ip_address: ipAddress.trim(),
                telnet_port: parseInt(telnetPort, 10) || 23,
                telnet_user: telnetUser.trim(),
                snmp_port: parseInt(snmpPort, 10) || 161,
                snmp_retries: parseInt(retries, 10) || 1,
                snmp_timeout: parseInt(timeoutVal, 10) || 10,
                poll_interval: parseInt(pollInterval, 10) || 600,
                cli_enabled: dualMode,
                cli_timeout: parseInt(cliTimeout, 10) || 5,
            };

            if (telnetPassword.trim()) {
                payload.telnet_password = telnetPassword.trim();
            }
            if (snmpCommunity.trim()) {
                payload.snmp_community = snmpCommunity.trim();
            }
            if (enablePassword.trim()) {
                payload.cli_enable_password = enablePassword.trim();
            }

            if (oltToEdit) {
                return await oltApi.update(oltToEdit.id, payload);
            } else {
                return await oltApi.create(payload);
            }
        },
        onSuccess: () => {
            toast.success(oltToEdit ? 'OLT device updated successfully!' : 'OLT registered successfully!');
            onSuccess();
            onOpenChange(false);
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to save OLT device. Please check input parameters.');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error('Please enter an OLT Name');
            return;
        }
        if (!ipAddress.trim()) {
            toast.error('Please enter the OLT IP Address');
            return;
        }
        saveMutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 rounded-xl bg-card border border-border shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 sticky top-0 z-10">
                    <div className="flex items-center gap-2.5 font-semibold text-lg">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 flex items-center justify-center">
                            <PlusCircle className="w-4 h-4" />
                        </div>
                        <DialogTitle className="text-base font-semibold text-foreground">
                            {oltToEdit ? 'Edit OLT Device' : 'Register New OLT'}
                        </DialogTitle>
                    </div>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* OLT Name */}
                    <div>
                        <Label className="text-xs font-semibold text-foreground">OLT Name</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Core OLT 1"
                            className="mt-1 text-sm h-10"
                            required
                        />
                    </div>

                    {/* OLT Latlong */}
                    <div>
                        <Label className="text-xs font-semibold text-foreground">OLT Latlong</Label>
                        <Input
                            value={latlong}
                            onChange={(e) => setLatlong(e.target.value)}
                            placeholder="e.g. 23.8103,90.4125"
                            className="mt-1 text-sm h-10"
                        />
                    </div>

                    {/* Row: Brand & Tech + Access Mode */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs font-semibold text-foreground">OLT Brand & Technology Type</Label>
                            <Select value={brandTech} onValueChange={setBrandTech}>
                                <SelectTrigger className="mt-1 text-sm h-10">
                                    <SelectValue placeholder="Select Brand & Tech" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BDCOM EPON">BDCOM EPON</SelectItem>
                                    <SelectItem value="BDCOM GPON">BDCOM GPON</SelectItem>
                                    <SelectItem value="VSOL EPON">VSOL EPON</SelectItem>
                                    <SelectItem value="VSOL GPON">VSOL GPON</SelectItem>
                                    <SelectItem value="C-DATA EPON">C-DATA EPON</SelectItem>
                                    <SelectItem value="C-DATA GPON">C-DATA GPON</SelectItem>
                                    <SelectItem value="HUAWEI GPON">HUAWEI GPON</SelectItem>
                                    <SelectItem value="ZTE GPON">ZTE GPON</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs font-semibold text-foreground">Access Mode</Label>
                            <Select value={accessMode} onValueChange={setAccessMode}>
                                <SelectTrigger className="mt-1 text-sm h-10">
                                    <SelectValue placeholder="Select Access Mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Telnet Mode">Telnet Mode</SelectItem>
                                    <SelectItem value="SNMP Only">SNMP Only</SelectItem>
                                    <SelectItem value="SNMP + Telnet Dual Mode">SNMP + Telnet Dual Mode</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Connection Path */}
                    <div>
                        <Label className="text-xs font-semibold text-foreground">Connection Path</Label>
                        <Select value={connectionPath} onValueChange={setConnectionPath}>
                            <SelectTrigger className="mt-1 text-sm h-10">
                                <SelectValue placeholder="Select Connection Path" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Direct OLT IP">Direct OLT IP</SelectItem>
                                <SelectItem value="Via PPTP VPN">Via PPTP VPN</SelectItem>
                                <SelectItem value="Via WireGuard">Via WireGuard</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Row: OLT IP Address + Telnet Port */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <Label className="text-xs font-semibold text-foreground">OLT IP Address</Label>
                            <Input
                                value={ipAddress}
                                onChange={(e) => setIpAddress(e.target.value)}
                                placeholder="e.g. 192.168.1.100"
                                className="mt-1 text-sm h-10"
                                required
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-semibold text-foreground">Telnet Port</Label>
                            <Input
                                type="number"
                                value={telnetPort}
                                onChange={(e) => setTelnetPort(e.target.value)}
                                placeholder="23"
                                className="mt-1 text-sm h-10"
                            />
                        </div>
                    </div>

                    {/* Info Alert Banner */}
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2.5 text-xs text-foreground leading-relaxed">
                        <Globe className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div>
                            <span className="font-medium text-primary">C-DATA V2 / BDCOM runs in SNMP + Telnet dual mode.</span> SNMP reads ONU/status/optics; Telnet validates CLI access and adds Caller-ID/MAC plus supported fallback/enrichment.
                        </div>
                    </div>

                    {/* Section: Access Credentials */}
                    <div className="pt-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                            <KeyRound className="w-3.5 h-3.5 text-primary" />
                            <span>Access Credentials</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs font-semibold text-foreground">Telnet/CLI User (Optional)</Label>
                                <Input
                                    value={telnetUser}
                                    onChange={(e) => setTelnetUser(e.target.value)}
                                    placeholder="admin"
                                    className="mt-1 text-sm h-10"
                                />
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-foreground">Telnet/CLI Password (Optional)</Label>
                                <Input
                                    type="password"
                                    value={telnetPassword}
                                    onChange={(e) => setTelnetPassword(e.target.value)}
                                    placeholder={oltToEdit ? '•••••••• (leave blank to keep unchanged)' : 'password'}
                                    className="mt-1 text-sm h-10"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                            <div>
                                <Label className="text-xs font-semibold text-foreground">SNMP Read Community</Label>
                                <Input
                                    value={snmpCommunity}
                                    onChange={(e) => setSnmpCommunity(e.target.value)}
                                    placeholder="public"
                                    className="mt-1 text-sm h-10"
                                />
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-foreground">SNMP Port</Label>
                                <Input
                                    type="number"
                                    value={snmpPort}
                                    onChange={(e) => setSnmpPort(e.target.value)}
                                    placeholder="161"
                                    className="mt-1 text-sm h-10"
                                />
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-foreground">Retries</Label>
                                <Input
                                    type="number"
                                    value={retries}
                                    onChange={(e) => setRetries(e.target.value)}
                                    placeholder="1"
                                    className="mt-1 text-sm h-10"
                                />
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-foreground">Timeout</Label>
                                <Input
                                    type="number"
                                    value={timeoutVal}
                                    onChange={(e) => setTimeoutVal(e.target.value)}
                                    placeholder="10"
                                    className="mt-1 text-sm h-10"
                                />
                            </div>
                        </div>

                        <div className="mt-3">
                            <Label className="text-xs font-semibold text-foreground">Poll Interval (seconds)</Label>
                            <Input
                                type="number"
                                value={pollInterval}
                                onChange={(e) => setPollInterval(e.target.value)}
                                placeholder="600"
                                className="mt-1 text-sm h-10 max-w-xs"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">Default 600 seconds (10 minutes).</p>
                        </div>
                    </div>

                    {/* Dual Mode Card */}
                    <div className="p-4 bg-muted/30 border border-border rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="dual_mode_check"
                                checked={dualMode}
                                onChange={(e) => setDualMode(e.target.checked)}
                                className="w-4 h-4 rounded text-primary focus:ring-primary border-input accent-primary"
                            />
                            <label htmlFor="dual_mode_check" className="text-xs font-medium text-foreground cursor-pointer select-none">
                                Use SNMP + Telnet Dual Mode / Caller-ID MAC collection
                            </label>
                        </div>

                        {dualMode && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                <div>
                                    <Label className="text-xs font-semibold text-foreground">Enable Password (optional)</Label>
                                    <Input
                                        type="password"
                                        value={enablePassword}
                                        onChange={(e) => setEnablePassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="mt-1 text-sm h-10"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-semibold text-foreground">CLI Timeout (s)</Label>
                                    <Input
                                        type="number"
                                        value={cliTimeout}
                                        onChange={(e) => setCliTimeout(e.target.value)}
                                        placeholder="5"
                                        className="mt-1 text-sm h-10"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="border-border text-foreground hover:bg-muted h-10 px-5"
                        >
                            Close
                        </Button>
                        <Button
                            type="submit"
                            disabled={saveMutation.isPending}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-10 px-6 shadow-xs"
                        >
                            {saveMutation.isPending ? 'Saving...' : (oltToEdit ? 'Update OLT' : 'Add OLT')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
