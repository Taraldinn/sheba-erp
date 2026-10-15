'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@/lib/query/native';
import {
    businessAgentApi,
    resellerApi,
    type BusinessAgent,
    type BusinessAgentCreatePayload,
    type ResellerProfile,
} from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/feedback/confirm';
import {
    UserCheck,
    Users,
    Plus,
    Pencil,
    Trash2,
    Building2,
    CreditCard,
    Phone,
    Mail,
    MapPin,
    Wallet,
    Search,
    RefreshCw,
    Link as LinkIcon,
    ArrowUpRight,
    ArrowDownRight,
    CheckCircle2,
    DollarSign,
    Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

interface AgentFormData {
    name: string;
    phone: string;
    email: string;
    address: string;
    bank_name: string;
    account_name: string;
    account_no: string;
    branch_name: string;
    routing_no: string;
    balance: string;
}

const emptyFormData: AgentFormData = {
    name: '',
    phone: '',
    email: '',
    address: '',
    bank_name: '',
    account_name: '',
    account_no: '',
    branch_name: '',
    routing_no: '',
    balance: '0',
};

export default function ManageAgentsPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    // Modals state
    const [agentModalOpen, setAgentModalOpen] = useState(false);
    const [editingAgent, setEditingAgent] = useState<BusinessAgent | null>(null);
    const [formData, setFormData] = useState<AgentFormData>(emptyFormData);

    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assignAgent, setAssignAgent] = useState<BusinessAgent | null>(null);
    const [selectedResellerIds, setSelectedResellerIds] = useState<string[]>([]);
    const [resellerSearch, setResellerSearch] = useState('');

    const [adjustModalOpen, setAdjustModalOpen] = useState(false);
    const [adjustAgent, setAdjustAgent] = useState<BusinessAgent | null>(null);
    const [adjustAction, setAdjustAction] = useState<'ADD' | 'DEDUCT' | 'SET'>('ADD');
    const [adjustAmount, setAdjustAmount] = useState('');
    const [adjustNotes, setAdjustNotes] = useState('');

    const [pendingDelete, setPendingDelete] = useState<BusinessAgent | null>(null);

    // Queries
    const agentsQuery = useQuery({
        queryKey: queryKeys.agents.businessList(),
        queryFn: () => businessAgentApi.list(),
    });

    const resellersQuery = useQuery({
        queryKey: queryKeys.reseller.list(),
        queryFn: () => resellerApi.list(),
    });

    const agents = agentsQuery.data ?? [];
    const resellers = (resellersQuery.data ?? []) as any[];

    // Filtered agents
    const filteredAgents = useMemo(() => {
        let list = agents;
        if (statusFilter !== 'all') {
            const isActive = statusFilter === 'active';
            list = list.filter(a => a.is_active === isActive);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.phone.toLowerCase().includes(q) ||
                (a.email && a.email.toLowerCase().includes(q)) ||
                (a.bank_name && a.bank_name.toLowerCase().includes(q)) ||
                (a.account_no && a.account_no.toLowerCase().includes(q)) ||
                (a.address && a.address.toLowerCase().includes(q))
            );
        }
        return list;
    }, [agents, statusFilter, searchQuery]);

    // Summary statistics
    const stats = useMemo(() => {
        const totalAgents = agents.length;
        const activeAgents = agents.filter(a => a.is_active).length;
        const totalResellersLinked = agents.reduce((acc, a) => acc + (a.resellers_count || (a.resellers?.length ?? 0)), 0);
        const totalBalance = agents.reduce((acc, a) => acc + (Number(a.balance) || 0), 0);
        return { totalAgents, activeAgents, totalResellersLinked, totalBalance };
    }, [agents]);

    // Mutations
    const createAgentMutation = useMutation({
        mutationFn: (payload: BusinessAgentCreatePayload) => businessAgentApi.create(payload),
        onSuccess: () => {
            toast.success('Agent created successfully');
            setAgentModalOpen(false);
            setFormData(emptyFormData);
            agentsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to create agent');
        },
    });

    const updateAgentMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<BusinessAgentCreatePayload> }) =>
            businessAgentApi.update(id, payload),
        onSuccess: () => {
            toast.success('Agent updated successfully');
            setAgentModalOpen(false);
            setEditingAgent(null);
            setFormData(emptyFormData);
            agentsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to update agent');
        },
    });

    const deleteAgentMutation = useMutation({
        mutationFn: (id: string) => businessAgentApi.remove(id),
        onSuccess: () => {
            toast.success('Agent removed successfully');
            setPendingDelete(null);
            agentsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete agent');
        },
    });

    const assignResellersMutation = useMutation({
        mutationFn: ({ id, resellerIds }: { id: string; resellerIds: string[] }) =>
            businessAgentApi.assignResellers(id, resellerIds),
        onSuccess: (data) => {
            toast.success(data.message || 'Resellers assigned successfully');
            setAssignModalOpen(false);
            setAssignAgent(null);
            agentsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to assign resellers');
        },
    });

    const adjustBalanceMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: { amount: number; action: 'ADD' | 'DEDUCT' | 'SET'; notes?: string } }) =>
            businessAgentApi.adjustBalance(id, data),
        onSuccess: (res) => {
            toast.success(res.message || 'Balance adjusted successfully');
            setAdjustModalOpen(false);
            setAdjustAgent(null);
            setAdjustAmount('');
            setAdjustNotes('');
            agentsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to adjust balance');
        },
    });

    // Handlers
    const openAddModal = () => {
        setEditingAgent(null);
        setFormData(emptyFormData);
        setAgentModalOpen(true);
    };

    const openEditModal = (agent: BusinessAgent) => {
        setEditingAgent(agent);
        setFormData({
            name: agent.name || '',
            phone: agent.phone || '',
            email: agent.email || '',
            address: agent.address || '',
            bank_name: agent.bank_name || '',
            account_name: agent.account_name || '',
            account_no: agent.account_no || '',
            branch_name: agent.branch_name || '',
            routing_no: agent.routing_no || '',
            balance: String(agent.balance || '0'),
        });
        setAgentModalOpen(true);
    };

    const handleSaveAgent = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            toast.error('Agent Name is required');
            return;
        }
        if (!formData.phone.trim()) {
            toast.error('Phone number is required');
            return;
        }

        const payload: BusinessAgentCreatePayload = {
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            email: formData.email.trim() || undefined,
            address: formData.address.trim() || undefined,
            bank_name: formData.bank_name.trim() || undefined,
            account_name: formData.account_name.trim() || undefined,
            account_no: formData.account_no.trim() || undefined,
            branch_name: formData.branch_name.trim() || undefined,
            routing_no: formData.routing_no.trim() || undefined,
        };

        if (editingAgent) {
            updateAgentMutation.mutate({ id: editingAgent.id, payload });
        } else {
            payload.balance = parseFloat(formData.balance || '0') || 0;
            createAgentMutation.mutate(payload);
        }
    };

    const openAssignModal = (agent: BusinessAgent) => {
        setAssignAgent(agent);
        setSelectedResellerIds((agent.resellers || []).map(String));
        setResellerSearch('');
        setAssignModalOpen(true);
    };

    const toggleResellerSelection = (resellerId: string) => {
        setSelectedResellerIds(prev =>
            prev.includes(resellerId) ? prev.filter(id => id !== resellerId) : [...prev, resellerId]
        );
    };

    const handleSaveAssignments = () => {
        if (!assignAgent) return;
        assignResellersMutation.mutate({
            id: assignAgent.id,
            resellerIds: selectedResellerIds,
        });
    };

    const openAdjustModal = (agent: BusinessAgent) => {
        setAdjustAgent(agent);
        setAdjustAction('ADD');
        setAdjustAmount('');
        setAdjustNotes('');
        setAdjustModalOpen(true);
    };

    const handleSaveAdjustBalance = (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustAgent) return;
        const amt = parseFloat(adjustAmount);
        if (isNaN(amt) || amt < 0) {
            toast.error('Please enter a valid positive amount');
            return;
        }
        adjustBalanceMutation.mutate({
            id: adjustAgent.id,
            data: {
                amount: amt,
                action: adjustAction,
                notes: adjustNotes.trim() || undefined,
            },
        });
    };

    // Calculate preview balance
    const previewBalance = useMemo(() => {
        if (!adjustAgent) return 0;
        const current = Number(adjustAgent.balance) || 0;
        const amt = parseFloat(adjustAmount) || 0;
        if (adjustAction === 'ADD') return current + amt;
        if (adjustAction === 'DEDUCT') return Math.max(0, current - amt);
        if (adjustAction === 'SET') return amt;
        return current;
    }, [adjustAgent, adjustAmount, adjustAction]);

    const formatCurrency = (val: number | string | undefined) => {
        const num = Number(val) || 0;
        return `৳ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Page Header (Matching Screenshot 1) */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            Manage Agents
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Oversee field collection agents, assigned reseller networks, and bank details.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => agentsQuery.refetch()}
                        disabled={agentsQuery.isLoading}
                        className="gap-2"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${agentsQuery.isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        onClick={openAddModal}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-xs gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add New Agent
                    </Button>
                </div>
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border bg-card/60 backdrop-blur-xs p-4 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
                        <span>Total Agents</span>
                        <UserCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold tracking-tight">{stats.totalAgents}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                        {stats.activeAgents} Active in service
                    </div>
                </div>

                <div className="rounded-2xl border bg-card/60 backdrop-blur-xs p-4 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
                        <span>Resellers Linked</span>
                        <LinkIcon className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold tracking-tight">{stats.totalResellersLinked}</div>
                    <div className="text-[11px] text-muted-foreground">
                        Assigned across all agents
                    </div>
                </div>

                <div className="rounded-2xl border bg-card/60 backdrop-blur-xs p-4 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
                        <span>Combined Balance</span>
                        <Wallet className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(stats.totalBalance)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                        Current agent collection balances
                    </div>
                </div>

                <div className="rounded-2xl border bg-card/60 backdrop-blur-xs p-4 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
                        <span>Active Network</span>
                        <Sparkles className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="text-2xl font-bold tracking-tight">
                        {resellers.length} Resellers
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                        Available in current tenant
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card/40 p-3 rounded-2xl border">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search agents by name, phone, bank..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-xs"
                    />
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                    {(['all', 'active', 'inactive'] as const).map((filter) => (
                        <Button
                            key={filter}
                            variant={statusFilter === filter ? 'default' : 'ghost'}
                            size="sm"
                            className="capitalize text-xs h-8 px-3"
                            onClick={() => setStatusFilter(filter)}
                        >
                            {filter}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Agents Table (Strictly matching Screenshot 1) */}
            <div className="rounded-2xl border bg-card shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                <th className="p-4 w-[28%]">Agent Info</th>
                                <th className="p-4 w-[30%]">Bank Details</th>
                                <th className="p-4 w-[18%]">Resellers</th>
                                <th className="p-4 w-[12%]">Balance</th>
                                <th className="p-4 w-[12%] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {agentsQuery.isLoading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                                            <span>Loading agents...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredAgents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center">
                                        <div className="max-w-xs mx-auto flex flex-col items-center justify-center text-center space-y-3">
                                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                                <Users className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-base text-foreground">No agents found</h3>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {searchQuery
                                                        ? 'No agents matched your search query.'
                                                        : 'There are no business agents added to this tenant yet.'}
                                                </p>
                                            </div>
                                            {!searchQuery && (
                                                <Button
                                                    onClick={openAddModal}
                                                    size="sm"
                                                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Add New Agent
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredAgents.map((agent) => (
                                    <tr
                                        key={agent.id}
                                        className="hover:bg-muted/30 transition-colors group"
                                    >
                                        {/* Column 1: Agent Info */}
                                        <td className="p-4 align-top">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm text-foreground">
                                                        {agent.name}
                                                    </span>
                                                    <Badge
                                                        variant={agent.is_active ? 'default' : 'secondary'}
                                                        className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                                                            agent.is_active
                                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                                : 'bg-muted text-muted-foreground'
                                                        }`}
                                                    >
                                                        {agent.is_active ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                </div>

                                                <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        <Phone className="w-3 h-3 text-primary shrink-0" />
                                                        <span className="font-mono text-foreground/90">{agent.phone}</span>
                                                    </div>

                                                    {agent.email && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                                                            <span>{agent.email}</span>
                                                        </div>
                                                    )}

                                                    {agent.address && (
                                                        <div className="flex items-start gap-1.5">
                                                            <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                                                            <span className="line-clamp-2">{agent.address}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Column 2: Bank Details */}
                                        <td className="p-4 align-top">
                                            {agent.bank_name || agent.account_no ? (
                                                <div className="space-y-1 rounded-lg bg-muted/40 p-2.5 border border-border/50 text-[11px]">
                                                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                                        <Building2 className="w-3.5 h-3.5 text-primary" />
                                                        <span>{agent.bank_name || 'Bank Not Specified'}</span>
                                                    </div>

                                                    {agent.account_name && (
                                                        <div className="text-muted-foreground">
                                                            A/C Name: <span className="text-foreground font-medium">{agent.account_name}</span>
                                                        </div>
                                                    )}

                                                    {agent.account_no && (
                                                        <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                                                            <CreditCard className="w-3 h-3 text-muted-foreground" />
                                                            <span>A/C No: <strong>{agent.account_no}</strong></span>
                                                        </div>
                                                    )}

                                                    {(agent.branch_name || agent.routing_no) && (
                                                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5 border-t border-border/40">
                                                            {agent.branch_name && <span>Branch: {agent.branch_name}</span>}
                                                            {agent.routing_no && <span>Routing: {agent.routing_no}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-muted-foreground italic text-xs py-2">
                                                    No bank details provided
                                                </div>
                                            )}
                                        </td>

                                        {/* Column 3: Resellers */}
                                        <td className="p-4 align-top">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-medium text-[11px]"
                                                    >
                                                        {agent.resellers_count ?? agent.resellers?.length ?? 0} Resellers
                                                    </Badge>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        className="h-5 w-5 text-muted-foreground hover:text-primary"
                                                        onClick={() => openAssignModal(agent)}
                                                        title="Assign Resellers"
                                                    >
                                                        <LinkIcon className="h-3 w-3" />
                                                    </Button>
                                                </div>

                                                {agent.reseller_names && agent.reseller_names.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {agent.reseller_names.slice(0, 3).map((rName, idx) => (
                                                            <span
                                                                key={idx}
                                                                className="inline-block px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground border truncate max-w-[130px]"
                                                                title={rName}
                                                            >
                                                                {rName}
                                                            </span>
                                                        ))}
                                                        {agent.reseller_names.length > 3 && (
                                                            <span className="inline-block px-1.5 py-0.5 bg-muted/60 rounded text-[10px] text-muted-foreground">
                                                                +{agent.reseller_names.length - 3} more
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-[11px] text-muted-foreground">
                                                        None assigned
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Column 4: Balance */}
                                        <td className="p-4 align-top">
                                            <div className="space-y-1.5">
                                                <div className="font-bold text-sm font-mono text-foreground">
                                                    {formatCurrency(agent.balance)}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 px-2 text-[10px] gap-1 hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30"
                                                    onClick={() => openAdjustModal(agent)}
                                                >
                                                    <Wallet className="w-2.5 h-2.5 text-emerald-500" />
                                                    Adjust
                                                </Button>
                                            </div>
                                        </td>

                                        {/* Column 5: Actions */}
                                        <td className="p-4 align-top text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                    onClick={() => openEditModal(agent)}
                                                    title="Edit Agent"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="h-7 w-7 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
                                                    onClick={() => openAssignModal(agent)}
                                                    title="Assign Resellers"
                                                >
                                                    <Users className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => setPendingDelete(agent)}
                                                    title="Delete Agent"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Add / Edit Agent (Strictly matching Screenshot 2) */}
            <Dialog open={agentModalOpen} onOpenChange={setAgentModalOpen}>
                <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-foreground">
                            {editingAgent ? `Edit Agent — ${editingAgent.name}` : 'Add New Agent'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            {editingAgent
                                ? 'Update agent details, contact info, and banking credentials.'
                                : 'Fill in the information below to register a new field or collection agent.'}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveAgent} className="space-y-6 pt-2">
                        {/* Section 1: Basic Info */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                                Basic Info
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="agent-name" className="text-xs font-medium">
                                        Name <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="agent-name"
                                        placeholder="Agent Name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="h-9 text-xs"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="agent-phone" className="text-xs font-medium">
                                        Phone <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="agent-phone"
                                        placeholder="01XXXXXXXXX"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="h-9 text-xs"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="agent-email" className="text-xs font-medium">
                                    Email
                                </Label>
                                <Input
                                    id="agent-email"
                                    type="email"
                                    placeholder="agent@example.com"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="h-9 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="agent-address" className="text-xs font-medium">
                                    Address
                                </Label>
                                <Textarea
                                    id="agent-address"
                                    placeholder="Physical address or area coverage..."
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    rows={2}
                                    className="text-xs resize-none"
                                />
                            </div>
                        </div>

                        {/* Section 2: Bank Information (Optional) */}
                        <div className="space-y-4 pt-2 border-t border-border/60">
                            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                                Bank Information (Optional)
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="bank-name" className="text-xs font-medium">
                                        Bank Name
                                    </Label>
                                    <Input
                                        id="bank-name"
                                        placeholder="e.g. Islami Bank, DBBL, BRAC"
                                        value={formData.bank_name}
                                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                                        className="h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="account-name" className="text-xs font-medium">
                                        Account Name
                                    </Label>
                                    <Input
                                        id="account-name"
                                        placeholder="e.g. Rahim Uddin"
                                        value={formData.account_name}
                                        onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                                        className="h-9 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="account-no" className="text-xs font-medium">
                                        Account No
                                    </Label>
                                    <Input
                                        id="account-no"
                                        placeholder="A/C Number"
                                        value={formData.account_no}
                                        onChange={(e) => setFormData({ ...formData, account_no: e.target.value })}
                                        className="h-9 text-xs font-mono"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="branch-name" className="text-xs font-medium">
                                        Branch Name
                                    </Label>
                                    <Input
                                        id="branch-name"
                                        placeholder="Branch location"
                                        value={formData.branch_name}
                                        onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                                        className="h-9 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="routing-no" className="text-xs font-medium">
                                    Routing No
                                </Label>
                                <Input
                                    id="routing-no"
                                    placeholder="e.g. 125272658"
                                    value={formData.routing_no}
                                    onChange={(e) => setFormData({ ...formData, routing_no: e.target.value })}
                                    className="h-9 text-xs font-mono"
                                />
                            </div>
                        </div>

                        {/* Starting Balance (Optional on create) */}
                        {!editingAgent && (
                            <div className="space-y-1.5 pt-2 border-t border-border/60">
                                <Label htmlFor="agent-balance" className="text-xs font-medium">
                                    Initial Collection Balance (৳)
                                </Label>
                                <Input
                                    id="agent-balance"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.balance}
                                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                                    className="h-9 text-xs font-mono"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Initial commission or cash balance assigned to this agent.
                                </p>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAgentModalOpen(false)}
                                className="h-9 text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={createAgentMutation.isPending || updateAgentMutation.isPending}
                                className="h-9 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                            >
                                {createAgentMutation.isPending || updateAgentMutation.isPending
                                    ? 'Saving...'
                                    : editingAgent
                                    ? 'Update Agent'
                                    : 'Save Agent'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal: Assign Resellers */}
            <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
                <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                            <Users className="w-4 h-4 text-primary" />
                            Assign Resellers to {assignAgent?.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Select the tenant resellers this agent is authorized to collect from and manage.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 space-y-3 flex-1 overflow-hidden flex flex-col">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search available resellers..."
                                value={resellerSearch}
                                onChange={(e) => setResellerSearch(e.target.value)}
                                className="pl-8 h-8 text-xs"
                            />
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                            <span>
                                <strong>{selectedResellerIds.length}</strong> of {resellers.length} selected
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedResellerIds(resellers.map((r: any) => String(r.id)))}
                                    className="text-primary hover:underline text-[11px]"
                                >
                                    Select All
                                </button>
                                <span>•</span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedResellerIds([])}
                                    className="text-muted-foreground hover:underline text-[11px]"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto border rounded-xl divide-y divide-border/60 max-h-[320px]">
                            {resellers.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground">
                                    No resellers found in this tenant.
                                </div>
                            ) : (
                                resellers
                                    .filter((r: any) =>
                                        (r.business_name || r.name || '')
                                            .toLowerCase()
                                            .includes(resellerSearch.toLowerCase().trim())
                                    )
                                    .map((reseller: any) => {
                                        const rId = String(reseller.id);
                                        const isSelected = selectedResellerIds.includes(rId);
                                        return (
                                            <label
                                                key={rId}
                                                className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                                                    isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleResellerSelection(rId)}
                                                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                                    />
                                                    <div>
                                                        <div className="font-medium text-xs text-foreground">
                                                            {reseller.business_name || reseller.name}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            Phone: {reseller.contact_phone || reseller.phone || 'N/A'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] ${
                                                        isSelected
                                                            ? 'border-primary/40 text-primary font-medium'
                                                            : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    {isSelected ? 'Assigned' : 'Unassigned'}
                                                </Badge>
                                            </label>
                                        );
                                    })
                            )}
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAssignModalOpen(false)}
                            className="h-8 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSaveAssignments}
                            disabled={assignResellersMutation.isPending}
                            className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                        >
                            {assignResellersMutation.isPending ? 'Saving...' : 'Save Assignments'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal: Adjust Balance */}
            <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-emerald-500" />
                            Adjust Balance — {adjustAgent?.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Record a cash collection deposit, commission settlement, or balance override.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveAdjustBalance} className="space-y-4 pt-2">
                        {/* Current Balance Banner */}
                        <div className="p-3 rounded-xl bg-muted/50 border border-border/60 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Current Balance:</span>
                            <span className="text-base font-bold font-mono text-foreground">
                                {formatCurrency(adjustAgent?.balance)}
                            </span>
                        </div>

                        {/* Action Type */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Adjustment Type</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={adjustAction === 'ADD' ? 'default' : 'outline'}
                                    className={`text-xs h-8 ${adjustAction === 'ADD' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                                    onClick={() => setAdjustAction('ADD')}
                                >
                                    <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                                    Add (+)
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={adjustAction === 'DEDUCT' ? 'default' : 'outline'}
                                    className={`text-xs h-8 ${adjustAction === 'DEDUCT' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
                                    onClick={() => setAdjustAction('DEDUCT')}
                                >
                                    <ArrowDownRight className="w-3.5 h-3.5 mr-1" />
                                    Deduct (-)
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={adjustAction === 'SET' ? 'default' : 'outline'}
                                    className={`text-xs h-8 ${adjustAction === 'SET' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                    onClick={() => setAdjustAction('SET')}
                                >
                                    Set (=)
                                </Button>
                            </div>
                        </div>

                        {/* Amount */}
                        <div className="space-y-1.5">
                            <Label htmlFor="adjust-amount" className="text-xs font-medium">
                                Amount (৳) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="adjust-amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0.00"
                                value={adjustAmount}
                                onChange={(e) => setAdjustAmount(e.target.value)}
                                className="h-9 text-xs font-mono text-base font-semibold"
                                required
                                autoFocus
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-1.5">
                            <Label htmlFor="adjust-notes" className="text-xs font-medium">
                                Reference / Notes
                            </Label>
                            <Input
                                id="adjust-notes"
                                placeholder="e.g. Deposit slip #4892, Cash handover"
                                value={adjustNotes}
                                onChange={(e) => setAdjustNotes(e.target.value)}
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Result Preview */}
                        {adjustAmount && (
                            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">New Balance Preview:</span>
                                <span className="font-bold font-mono text-primary text-sm">
                                    {formatCurrency(previewBalance)}
                                </span>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setAdjustModalOpen(false)}
                                className="h-8 text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={adjustBalanceMutation.isPending || !adjustAmount}
                                className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                            >
                                {adjustBalanceMutation.isPending ? 'Updating...' : 'Confirm Adjustment'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Confirm Delete Agent Dialog */}
            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title={`Delete Agent ${pendingDelete?.name}?`}
                description={
                    <div className="space-y-2 text-xs text-muted-foreground">
                        <p>
                            Are you sure you want to remove <strong>{pendingDelete?.name}</strong> (Phone: {pendingDelete?.phone})?
                        </p>
                        <p className="text-amber-600 dark:text-amber-400">
                            Any assigned resellers will be unlinked. Current balance is {formatCurrency(pendingDelete?.balance)}.
                        </p>
                    </div>
                }
                confirmLabel="Delete Agent"
                destructive
                onConfirm={() => {
                    if (pendingDelete) {
                        deleteAgentMutation.mutate(pendingDelete.id);
                    }
                }}
            />
        </div>
    );
}
