'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@/lib/query/native';
import {
    branchesApi,
    routerApi,
    packageApi,
    businessAgentApi,
    type Branch,
    type Router,
    type IspPackage,
    type BusinessAgent,
} from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
import { Clock, Search, Check, X, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface PopBranchModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    branchToEdit?: Branch | null;
    onSuccess: () => void;
}

export function PopBranchModal({
    open,
    onOpenChange,
    branchToEdit,
    onSuccess,
}: PopBranchModalProps) {
    // Form fields matching Screenshot 2
    const [fullName, setFullName] = useState('');
    const [phoneNo, setPhoneNo] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [nid, setNid] = useState('');
    const [advanceLimit, setAdvanceLimit] = useState('0');
    const [enableUndoRecharge, setEnableUndoRecharge] = useState(false);
    const [userExpireTime, setUserExpireTime] = useState('11:59 PM');
    const [enableGlobalSms, setEnableGlobalSms] = useState(false);
    const [address, setAddress] = useState('');
    const [role, setRole] = useState('POP Manager');
    const [assignRouter, setAssignRouter] = useState('global');
    const [allowedPackages, setAllowedPackages] = useState<string[]>([]);
    const [packageSearch, setPackageSearch] = useState('');
    const [assignSupervisor, setAssignSupervisor] = useState('none');
    const [selectAgent, setSelectAgent] = useState('none');
    const [commissionType, setCommissionType] = useState<'FIXED' | 'PACKAGE_WISE'>('FIXED');
    const [fixedCommission, setFixedCommission] = useState('0.00');

    // Queries to populate dropdowns
    const routersQuery = useQuery({
        queryKey: queryKeys.routers.list(),
        queryFn: () => routerApi.list(),
        enabled: open,
    });
    const routers: Router[] = routersQuery.data ?? [];

    const packagesQuery = useQuery({
        queryKey: queryKeys.packages.list(),
        queryFn: () => packageApi.list(),
        enabled: open,
    });
    const packages: IspPackage[] = packagesQuery.data ?? [];

    const agentsQuery = useQuery({
        queryKey: queryKeys.agents.businessList(),
        queryFn: () => businessAgentApi.list(),
        enabled: open,
    });
    const agents: BusinessAgent[] = agentsQuery.data ?? [];

    const allBranchesQuery = useQuery({
        queryKey: queryKeys.branches.list(),
        queryFn: () => branchesApi.list(),
        enabled: open,
    });
    const branches: Branch[] = allBranchesQuery.data ?? [];

    // Populate or reset form when modal opens
    useEffect(() => {
        if (!open) return;

        if (branchToEdit) {
            setFullName(branchToEdit.name || '');
            setPhoneNo(branchToEdit.contact || '');
            setUsername(branchToEdit.username || '');
            setPassword(branchToEdit.password || '');
            setNid(branchToEdit.nid || '');
            setAdvanceLimit(String(branchToEdit.advance_balance_limit ?? '0'));
            setEnableUndoRecharge(Boolean(branchToEdit.enable_undo_recharge));
            setUserExpireTime(branchToEdit.user_expire_time || '11:59 PM');
            setEnableGlobalSms(Boolean(branchToEdit.enable_global_sms));
            setAddress(branchToEdit.location || '');
            setRole(branchToEdit.role || 'POP Manager');
            setAssignRouter(branchToEdit.upstream_router ? String(branchToEdit.upstream_router) : 'global');
            setAllowedPackages((branchToEdit.allowed_packages || []).map(String));
            setAssignSupervisor(branchToEdit.supervisor ? String(branchToEdit.supervisor) : 'none');
            setSelectAgent(branchToEdit.agent ? String(branchToEdit.agent) : 'none');
            setCommissionType((branchToEdit.commission_type as any) || 'FIXED');
            setFixedCommission(String(branchToEdit.fixed_commission_amount ?? '0.00'));
        } else {
            setFullName('');
            setPhoneNo('');
            setUsername('');
            setPassword('');
            setNid('');
            setAdvanceLimit('0');
            setEnableUndoRecharge(false);
            setUserExpireTime('11:59 PM');
            setEnableGlobalSms(false);
            setAddress('');
            setRole('POP Manager');
            setAssignRouter('global');
            setAllowedPackages([]);
            setPackageSearch('');
            setAssignSupervisor('none');
            setSelectAgent('none');
            setCommissionType('FIXED');
            setFixedCommission('0.00');
        }
    }, [open, branchToEdit]);

    // Mutation
    const saveMutation = useMutation({
        mutationFn: async (payload: Partial<Branch>) => {
            if (branchToEdit) {
                return branchesApi.update(branchToEdit.id, payload);
            }
            return branchesApi.create(payload);
        },
        onSuccess: () => {
            toast.success(branchToEdit ? 'POP/Branch updated successfully' : 'POP/Branch created successfully');
            onSuccess();
            onOpenChange(false);
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to save POP/Branch');
        },
    });

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName.trim()) {
            toast.error('Full Name is required');
            return;
        }

        const payload: Partial<Branch> = {
            name: fullName.trim(),
            contact: phoneNo.trim(),
            username: username.trim(),
            password: password.trim(),
            nid: nid.trim(),
            advance_balance_limit: parseFloat(advanceLimit) || 0,
            enable_undo_recharge: enableUndoRecharge,
            user_expire_time: userExpireTime.trim() || '11:59 PM',
            enable_global_sms: enableGlobalSms,
            location: address.trim(),
            role,
            upstream_router: assignRouter === 'global' ? null : assignRouter,
            allowed_packages: allowedPackages,
            supervisor: assignSupervisor === 'none' ? null : assignSupervisor,
            agent: selectAgent === 'none' ? null : selectAgent,
            commission_type: commissionType,
            fixed_commission_amount: parseFloat(fixedCommission) || 0,
            status: branchToEdit?.status || 'Active',
        };

        saveMutation.mutate(payload);
    };

    // Filter packages by search
    const filteredPackages = useMemo(() => {
        if (!packageSearch.trim()) return packages;
        const q = packageSearch.toLowerCase().trim();
        return packages.filter(p => p.name.toLowerCase().includes(q));
    }, [packages, packageSearch]);

    const togglePackage = (pkgId: string) => {
        setAllowedPackages(prev =>
            prev.includes(pkgId) ? prev.filter(id => id !== pkgId) : [...prev, pkgId]
        );
    };

    const selectAllPackages = () => {
        setAllowedPackages(packages.map(p => String(p.id)));
    };

    const clearAllPackages = () => {
        setAllowedPackages([]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
                <DialogHeader className="pb-2 border-b">
                    <DialogTitle className="text-lg font-bold text-foreground">
                        {branchToEdit ? `Edit POP/Branch — ${branchToEdit.name}` : 'Create New POP/Branch'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleFormSubmit} className="space-y-4 pt-2">
                    {/* Row 1: Full Name | Phone No */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="branch-fullname" className="text-xs font-medium">
                                Full Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="branch-fullname"
                                placeholder="Branch / In-charge name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="h-9 text-xs"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="branch-phone" className="text-xs font-medium">
                                Phone No
                            </Label>
                            <Input
                                id="branch-phone"
                                placeholder="01XXXXXXXXX"
                                value={phoneNo}
                                onChange={(e) => setPhoneNo(e.target.value)}
                                className="h-9 text-xs"
                            />
                        </div>
                    </div>

                    {/* Row 2: Username | Password */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="branch-username" className="text-xs font-medium">
                                Username
                            </Label>
                            <Input
                                id="branch-username"
                                placeholder="Username for login"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="h-9 text-xs font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="branch-password" className="text-xs font-medium">
                                Password
                            </Label>
                            <Input
                                id="branch-password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-9 text-xs font-mono"
                            />
                        </div>
                    </div>

                    {/* Row 3: NID / ID Number | Advance Balance Limit (৳) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="branch-nid" className="text-xs font-medium">
                                NID / ID Number
                            </Label>
                            <Input
                                id="branch-nid"
                                placeholder="National ID / Registration No"
                                value={nid}
                                onChange={(e) => setNid(e.target.value)}
                                className="h-9 text-xs font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="branch-advance-limit" className="text-xs font-bold text-destructive">
                                Advance Balance Limit (৳)
                            </Label>
                            <Input
                                id="branch-advance-limit"
                                type="number"
                                step="0.01"
                                placeholder="0"
                                value={advanceLimit}
                                onChange={(e) => setAdvanceLimit(e.target.value)}
                                className="h-9 text-xs font-mono"
                            />
                        </div>
                    </div>

                    {/* Row 4: Enable Undo Recharge | User Expire Time */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1">
                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={enableUndoRecharge}
                                onClick={() => setEnableUndoRecharge(!enableUndoRecharge)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    enableUndoRecharge ? 'bg-primary' : 'bg-muted-foreground/30'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        enableUndoRecharge ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                            <span className="text-xs font-medium text-foreground">
                                Enable Undo Recharge
                            </span>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="branch-expire-time" className="text-xs font-medium">
                                User Expire Time
                            </Label>
                            <div className="relative">
                                <Input
                                    id="branch-expire-time"
                                    placeholder="11:59 PM"
                                    value={userExpireTime}
                                    onChange={(e) => setUserExpireTime(e.target.value)}
                                    className="h-9 text-xs pr-8"
                                />
                                <Clock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Row 5: Enable Global SMS API (Super Admin API) */}
                    <div className="flex items-center gap-2.5 pt-1">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enableGlobalSms}
                            onClick={() => setEnableGlobalSms(!enableGlobalSms)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                enableGlobalSms ? 'bg-blue-600' : 'bg-muted-foreground/30'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    enableGlobalSms ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                            Enable Global SMS API (Super Admin API)
                        </span>
                    </div>

                    {/* Row 6: Address */}
                    <div className="space-y-1.5">
                        <Label htmlFor="branch-address" className="text-xs font-medium">
                            Address
                        </Label>
                        <Textarea
                            id="branch-address"
                            placeholder="Physical address or coverage area..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            rows={2}
                            className="text-xs resize-none"
                        />
                    </div>

                    {/* Row 7: Role | Assign Router */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Role</Label>
                            <Select value={role} onValueChange={setRole}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Select Role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="POP Manager">POP Manager</SelectItem>
                                    <SelectItem value="Branch Admin">Branch Admin</SelectItem>
                                    <SelectItem value="Reseller">Reseller</SelectItem>
                                    <SelectItem value="Sub-Reseller">Sub-Reseller</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Assign Router</Label>
                            <Select value={assignRouter} onValueChange={setAssignRouter}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Global (Select Router)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="global">Global (Select Router)</SelectItem>
                                    {routers.map((r) => (
                                        <SelectItem key={r.id} value={String(r.id)}>
                                            {r.name} ({r.ip_address})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Section: Allowed Packages (Leave empty to allow all) */}
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium">
                                Allowed Packages <span className="text-muted-foreground font-normal">(Leave empty to allow all)</span>
                            </Label>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={selectAllPackages}
                                    className="h-6 px-2 text-[10px] text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 gap-1"
                                >
                                    <Check className="h-3 w-3" />
                                    All
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={clearAllPackages}
                                    className="h-6 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10 gap-1"
                                >
                                    <X className="h-3 w-3" />
                                    Clear
                                </Button>
                            </div>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search package..."
                                value={packageSearch}
                                onChange={(e) => setPackageSearch(e.target.value)}
                                className="h-8 pl-8 text-xs"
                            />
                        </div>

                        <div className="max-h-28 overflow-y-auto border rounded-lg p-1.5 space-y-1 bg-muted/20">
                            {filteredPackages.length === 0 ? (
                                <div className="text-center py-4 text-xs text-muted-foreground">
                                    No packages found
                                </div>
                            ) : (
                                filteredPackages.map((pkg) => {
                                    const pkgId = String(pkg.id);
                                    const isChecked = allowedPackages.includes(pkgId);
                                    return (
                                        <label
                                            key={pkgId}
                                            className="flex items-center justify-between p-1.5 rounded hover:bg-muted cursor-pointer text-xs"
                                        >
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => togglePackage(pkgId)}
                                                    className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                                                />
                                                <span className="font-medium">{pkg.name}</span>
                                            </div>
                                            <span className="text-muted-foreground font-mono text-[11px]">
                                                ৳ {pkg.regular_price}
                                            </span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Row: Assign Supervisor (For Resellers/SubResellers) */}
                    <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-medium">
                            Assign Supervisor <span className="text-muted-foreground font-normal">(For Resellers/SubResellers)</span>
                        </Label>
                        <Select value={assignSupervisor} onValueChange={setAssignSupervisor}>
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {branches
                                    .filter(b => !branchToEdit || b.id !== branchToEdit.id)
                                    .map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            {b.name} ({b.role || 'POP'})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Section: Agent Commission (Matching Screenshot 2) */}
                    <div className="space-y-3 pt-2 border-t">
                        <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                            Agent Commission
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Select Agent (Optional)</Label>
                                <Select value={selectAgent} onValueChange={setSelectAgent}>
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue placeholder="-- No Agent --" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">-- No Agent --</SelectItem>
                                        {agents.map((ag) => (
                                            <SelectItem key={ag.id} value={String(ag.id)}>
                                                {ag.name} ({ag.phone})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Commission Type</Label>
                                <div className="flex items-center gap-4 h-9">
                                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                        <input
                                            type="radio"
                                            name="commissionType"
                                            checked={commissionType === 'FIXED'}
                                            onChange={() => setCommissionType('FIXED')}
                                            className="text-primary focus:ring-primary h-3.5 w-3.5"
                                        />
                                        <span>Fixed Amount</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                        <input
                                            type="radio"
                                            name="commissionType"
                                            checked={commissionType === 'PACKAGE_WISE'}
                                            onChange={() => setCommissionType('PACKAGE_WISE')}
                                            className="text-primary focus:ring-primary h-3.5 w-3.5"
                                        />
                                        <span>Package Wise</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="fixed-commission" className="text-xs font-medium">
                                Fixed Commission Amount (BDT)
                            </Label>
                            <Input
                                id="fixed-commission"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={fixedCommission}
                                onChange={(e) => setFixedCommission(e.target.value)}
                                className="h-9 text-xs font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Agent gets this amount for every client created by this reseller.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="h-9 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={saveMutation.isPending}
                            className="h-9 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                        >
                            {saveMutation.isPending ? 'Saving...' : 'Save Reseller'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
