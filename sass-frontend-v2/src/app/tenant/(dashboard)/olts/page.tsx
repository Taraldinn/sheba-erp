'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@/lib/query/native';
import { oltApi, pptpVpnApi, type Olt, type PptpVpnConfig } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { RegisterOltModal } from './register-olt-modal';
import { PptpVpnModal } from './pptp-vpn-modal';
import { NetworkMap } from './network-map';
import {
    Server,
    Layers,
    Map as MapIcon,
    Plus,
    Network,
    Settings,
    Play,
    Square,
    Stethoscope,
    Info,
    AlertTriangle,
    Activity,
    Pencil,
    Trash2,
    RefreshCw,
    Radio,
    Power,
    CheckCircle2,
    Wifi,
} from 'lucide-react';
import { toast } from 'sonner';

export default function TenantOltsPage() {
    const [activeTab, setActiveTab] = useState<'devices' | 'map'>('devices');
    const [oltModalOpen, setOltModalOpen] = useState(false);
    const [editingOlt, setEditingOlt] = useState<Olt | null>(null);
    const [pendingDeleteOlt, setPendingDeleteOlt] = useState<Olt | null>(null);
    const [vpnModalOpen, setVpnModalOpen] = useState(false);

    // Queries
    const oltsQuery = useQuery({
        queryKey: queryKeys.olts.list(),
        queryFn: () => oltApi.list(),
    });

    const vpnQuery = useQuery({
        queryKey: queryKeys.pptpVpn.config(),
        queryFn: () => pptpVpnApi.get(),
    });

    const olts: Olt[] = oltsQuery.data ?? [];
    const vpnConfig: PptpVpnConfig | undefined = vpnQuery.data;

    // Connect / Disconnect Tunnel Mutation
    const toggleTunnelMutation = useMutation({
        mutationFn: async () => {
            return await pptpVpnApi.connect();
        },
        onSuccess: (data) => {
            if (data.status === 'Connected') {
                toast.success('PPTP VPN Tunnel established successfully! Interface ppp0 is active.');
            } else {
                toast.info('PPTP VPN Tunnel disconnected.');
            }
            vpnQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to toggle PPTP tunnel state.');
        },
    });

    // Run Diagnostics Mutation
    const diagnosticsMutation = useMutation({
        mutationFn: async () => {
            return await pptpVpnApi.diagnostics();
        },
        onSuccess: (data) => {
            if (data.success) {
                toast.success(`Diagnostics OK: ${data.details.ping_status} (${data.details.latency_ms}ms latency). Subnet is reachable.`);
            } else {
                toast.warning(`Diagnostics Warning: ${data.details?.reason || 'Tunnel unreachable or unconfigured.'}`);
            }
            vpnQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to run diagnostics on PPTP tunnel.');
        },
    });

    // Test OLT Connection Mutation
    const testOltMutation = useMutation({
        mutationFn: async (oltId: string) => {
            return await oltApi.test(oltId);
        },
        onSuccess: (res) => {
            if (res.ok) {
                toast.success(`OLT reachable! ${res.message || 'SNMP response received.'}`);
            } else {
                toast.error(`OLT connection failed: ${res.message || 'SNMP timeout.'}`);
            }
            oltsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to test OLT connectivity.');
        },
    });

    // Delete OLT Mutation
    const deleteOltMutation = useMutation({
        mutationFn: async (oltId: string) => {
            return await oltApi.remove(oltId);
        },
        onSuccess: () => {
            toast.success('OLT device removed successfully.');
            oltsQuery.refetch();
            setPendingDeleteOlt(null);
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete OLT.');
        },
    });

    const isConnected = vpnConfig?.status === 'Connected';

    return (
        <div className="space-y-6 pb-12">
            {/* Top Header matching Screenshot 1 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs flex items-center justify-center">
                        <Server className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                            OLT Monitoring System
                            <span className="text-sm font-normal text-muted-foreground">
                                (Total: {olts.length})
                            </span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* Live Network Topology Button */}
                    <Link href="/tenant/topology" className="w-full sm:w-auto">
                        <Button
                            variant="secondary"
                            className="bg-[#0f172a] hover:bg-[#1e293b] text-white font-medium text-xs h-9 px-4 gap-2 shadow-xs w-full sm:w-auto"
                        >
                            <Network className="w-4 h-4 text-cyan-400" />
                            Live Network Topology
                        </Button>
                    </Link>

                    {/* Add New OLT Button */}
                    <Button
                        onClick={() => {
                            setEditingOlt(null);
                            setOltModalOpen(true);
                        }}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs h-9 px-4 gap-1.5 shadow-xs w-full sm:w-auto"
                    >
                        <Plus className="w-4 h-4" />
                        Add New OLT
                    </Button>
                </div>
            </div>

            {/* Tabs matching Screenshot 1 & 4 */}
            <div className="flex items-center gap-2 border-b border-border">
                <button
                    onClick={() => setActiveTab('devices')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-[2px] ${
                        activeTab === 'devices'
                            ? 'border-primary text-primary bg-card shadow-2xs'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                >
                    <Layers className="w-4 h-4" />
                    OLT Devices
                </button>
                <button
                    onClick={() => setActiveTab('map')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-[2px] ${
                        activeTab === 'map'
                            ? 'border-primary text-primary bg-card shadow-2xs'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                >
                    <MapIcon className="w-4 h-4" />
                    Network Map
                </button>
            </div>

            {/* Tab 1: OLT Devices */}
            {activeTab === 'devices' && (
                <div className="space-y-6">
                    {/* Empty Info Banner matching Screenshot 1 */}
                    {olts.length === 0 ? (
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-3 text-xs text-foreground">
                            <Info className="w-4 h-4 text-primary shrink-0" />
                            <span>
                                No OLTs found in the system. Use the &apos;Add New OLT&apos; button above to register your first device.
                            </span>
                        </div>
                    ) : (
                        /* OLT Devices Table */
                        <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                            <th className="py-3 px-4">OLT Name & Brand</th>
                                            <th className="py-3 px-4">IP Address & Port</th>
                                            <th className="py-3 px-4">Access Mode & Path</th>
                                            <th className="py-3 px-4 text-center">PON Ports</th>
                                            <th className="py-3 px-4 text-center">ONUs (Online/Total)</th>
                                            <th className="py-3 px-4 text-center">Status</th>
                                            <th className="py-3 px-4">Coordinates</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border text-xs">
                                        {olts.map((olt) => (
                                            <tr key={olt.id} className="hover:bg-muted/40 transition-colors">
                                                <td className="py-3 px-4 font-semibold text-foreground">
                                                    <div className="flex items-center gap-2">
                                                        <Radio className="w-4 h-4 text-primary shrink-0" />
                                                        <div>
                                                            <div>{olt.name}</div>
                                                            <div className="text-[11px] font-normal text-muted-foreground">
                                                                {olt.brand || 'BDCOM'} {olt.access_mode || 'EPON'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-foreground/85 font-mono">
                                                    {olt.ip_address}:{olt.telnet_port || 23}
                                                </td>
                                                <td className="py-3 px-4 text-muted-foreground">
                                                    <div className="font-medium text-foreground">{olt.cli_access_mode || 'Telnet Mode'}</div>
                                                    <div className="text-[11px] text-muted-foreground/80">{olt.connection_path || 'Direct OLT IP'}</div>
                                                </td>
                                                <td className="py-3 px-4 text-center text-foreground font-medium">
                                                    {olt.pon_ports_count || 8} ports
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                                        {olt.online_onus || 0}
                                                    </span>
                                                    <span className="text-muted-foreground"> / {olt.total_onus || 0}</span>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[11px] font-semibold ${
                                                            olt.status === 'Online'
                                                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                                                : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                                                        }`}
                                                    >
                                                        ● {olt.status || 'Online'}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                                                    {olt.lat_long || (olt.latitude && olt.longitude ? `${Number(olt.latitude).toFixed(4)},${Number(olt.longitude).toFixed(4)}` : '23.8103,90.4125')}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => testOltMutation.mutate(olt.id)}
                                                            disabled={testOltMutation.isPending}
                                                            title="Test Connectivity"
                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                        >
                                                            <Activity className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setEditingOlt(olt);
                                                                setOltModalOpen(true);
                                                            }}
                                                            title="Edit OLT"
                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setPendingDeleteOlt(olt)}
                                                            title="Delete OLT"
                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* PPTP VPN LAN Connectivity Settings Card matching Screenshot 1 & 3 */}
                    <div className="bg-card rounded-xl border border-border shadow-xs p-6 space-y-5">
                        {/* Card Header */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Network className="w-5 h-5 text-primary" />
                                    <h2 className="text-base font-bold text-foreground">
                                        PPTP VPN LAN Connectivity Settings
                                    </h2>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Establish a tenant-scoped PPTP tunnel from this SG server to the client&apos;s MikroTik so OLT private IPs can be reached directly.
                                </p>
                                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium pt-0.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span>PPTP is a legacy protocol. Use it only for restricted OLT management reachability and strong unique credentials.</span>
                                </div>
                            </div>

                            {/* Status Badge */}
                            <div>
                                <Badge
                                    variant="outline"
                                    className={`px-3 py-1 text-xs font-semibold rounded-md border flex items-center gap-1.5 ${
                                        isConnected
                                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                                            : vpnConfig?.status === 'Connecting'
                                            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800'
                                            : 'bg-muted text-muted-foreground border-border'
                                    }`}
                                >
                                    {isConnected ? (
                                        <>
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                            Connected
                                        </>
                                    ) : vpnConfig?.status === 'Connecting' ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
                                            Connecting
                                        </>
                                    ) : (
                                        <>
                                            <Power className="w-3.5 h-3.5 text-muted-foreground" />
                                            Disabled
                                        </>
                                    )}
                                </Badge>
                            </div>
                        </div>

                        {/* Card Columns */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                            {/* Left Column: Connection Parameters */}
                            <div className="lg:col-span-2 bg-muted/30 border border-border/80 rounded-lg p-5 space-y-4">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                                    <Info className="w-3.5 h-3.5 text-primary" />
                                    <span>Connection Parameters</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6 text-xs">
                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">PPTP Server IP:</div>
                                        <div className="mt-0.5 font-medium text-foreground">
                                            {vpnConfig?.server_ip ? vpnConfig.server_ip : <span className="italic text-muted-foreground font-normal">Not configured</span>}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">OLT LAN Subnet Route:</div>
                                        <div className="mt-0.5 font-medium text-foreground">
                                            {vpnConfig?.lan_subnet ? vpnConfig.lan_subnet : <span className="italic text-muted-foreground font-normal">Not configured</span>}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tunnel Username:</div>
                                        <div className="mt-0.5 font-medium text-foreground">
                                            {vpnConfig?.username ? vpnConfig.username : <span className="italic text-muted-foreground font-normal">Not configured</span>}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Active Interface:</div>
                                        <div className={`mt-0.5 font-medium ${isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                                            {vpnConfig?.active_interface || 'None'}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Encryption:</div>
                                        <div className="mt-0.5 font-semibold text-primary">
                                            {vpnConfig?.require_mppe ? 'Required (MPPE-128)' : 'Optional / Disabled'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tunnel Reachability:</div>
                                        <div className="mt-0.5 font-medium text-foreground">
                                            {vpnConfig?.tunnel_reachability || 'Unknown'}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Last Health Check:</div>
                                        <div className="mt-0.5 text-muted-foreground">
                                            {vpnConfig?.last_health_check ? new Date(vpnConfig.last_health_check).toLocaleString() : '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Last Successful Handshake:</div>
                                        <div className="mt-0.5 text-muted-foreground">
                                            {vpnConfig?.last_handshake ? new Date(vpnConfig.last_handshake).toLocaleString() : '—'}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Last OLT Reachable:</div>
                                        <div className="mt-0.5 text-muted-foreground">
                                            {vpnConfig?.last_olt_reachable ? new Date(vpnConfig.last_olt_reachable).toLocaleString() : '—'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Tunnel Controls matching Screenshot 1 */}
                            <div className="bg-muted/30 border border-border/80 rounded-lg p-5 flex flex-col justify-between space-y-4">
                                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary">
                                    <Wifi className="w-3.5 h-3.5 text-primary" />
                                    <span>Tunnel Controls</span>
                                </div>

                                <div className="space-y-3 flex-1 flex flex-col justify-center">
                                    {/* Configure VPN Button */}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setVpnModalOpen(true)}
                                        className="w-full border-primary/40 text-primary hover:bg-primary/10 text-xs font-semibold h-10 gap-2 shadow-2xs"
                                    >
                                        <Settings className="w-4 h-4 text-primary" />
                                        Configure VPN
                                    </Button>

                                    {/* Establish Tunnel (Connect) Button */}
                                    <Button
                                        type="button"
                                        onClick={() => toggleTunnelMutation.mutate()}
                                        disabled={toggleTunnelMutation.isPending}
                                        className={`w-full text-white text-xs font-semibold h-10 gap-2 shadow-2xs ${
                                            isConnected
                                                ? 'bg-rose-600 hover:bg-rose-700'
                                                : 'bg-emerald-600 hover:bg-emerald-700'
                                        }`}
                                    >
                                        {isConnected ? (
                                            <>
                                                <Square className="w-4 h-4 fill-white" />
                                                Disconnect Tunnel
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-4 h-4 fill-white" />
                                                Establish Tunnel (Connect)
                                            </>
                                        )}
                                    </Button>

                                    {/* Run Diagnostics Button */}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => diagnosticsMutation.mutate()}
                                        disabled={diagnosticsMutation.isPending}
                                        className="w-full border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold h-10 gap-2 shadow-2xs"
                                    >
                                        <Stethoscope className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                        {diagnosticsMutation.isPending ? 'Running...' : 'Run Diagnostics'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Network Map */}
            {activeTab === 'map' && (
                <NetworkMap olts={olts} />
            )}

            {/* Register / Edit OLT Modal */}
            <RegisterOltModal
                open={oltModalOpen}
                onOpenChange={setOltModalOpen}
                oltToEdit={editingOlt}
                onSuccess={() => {
                    oltsQuery.refetch();
                }}
            />

            {/* Configure PPTP VPN Modal */}
            <PptpVpnModal
                open={vpnModalOpen}
                onOpenChange={setVpnModalOpen}
                currentConfig={vpnConfig}
                onSuccess={() => {
                    vpnQuery.refetch();
                }}
            />

            {/* Confirm Delete OLT Dialog */}
            <ConfirmDialog
                open={Boolean(pendingDeleteOlt)}
                onOpenChange={(open) => !open && setPendingDeleteOlt(null)}
                title="Delete OLT Device"
                description={
                    <span>
                        Are you sure you want to remove <strong>{pendingDeleteOlt?.name}</strong> ({pendingDeleteOlt?.ip_address})?
                        This will unlink any registered ONUs and stop polling.
                    </span>
                }
                confirmLabel="Delete OLT"
                destructive
                onConfirm={() => {
                    if (pendingDeleteOlt) {
                        deleteOltMutation.mutate(pendingDeleteOlt.id);
                    }
                }}
            />
        </div>
    );
}
