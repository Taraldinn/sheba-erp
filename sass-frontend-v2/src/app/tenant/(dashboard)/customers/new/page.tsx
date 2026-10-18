'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { queryKeys } from '@/lib/query/keys';
import { customerApi, packageApi, routerApi, branchesApi, tjBoxesApi, type CustomerCreatePayload } from '@/lib/api';
import { withMutationToast } from '@/lib/mutation-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    User,
    UserPlus,
    CreditCard,
    Network,
    FileText,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Loader2,
    Sparkles,
    Eye,
    EyeOff,
    MapPin,
    RefreshCw,
} from 'lucide-react';

// Bangladesh Administrative Districts & Thanas
const BD_LOCATIONS: Record<string, string[]> = {
    Dhaka: [
        'Mirpur', 'Dhanmondi', 'Gulshan', 'Banani', 'Uttara', 'Mohammadpur', 'Motijheel',
        'Badda', 'Khilkhet', 'Pallabi', 'Tejgaon', 'Rampura', 'Jatrabari', 'Savar',
        'Keraniganj', 'Dhamrai', 'Lalbagh', 'New Market', 'Shahbagh', 'Kafrul'
    ],
    Chittagong: [
        'Kotwali', 'Panchlaish', 'Pahartali', 'Halishahar', 'Double Mooring', 'Patenga',
        'Hathazari', 'Sitakunda', 'Patiya', 'Raozan', 'Fatikchhari', 'Anwara', 'Boalkhali'
    ],
    Gazipur: [
        'Gazipur Sadar', 'Tongi', 'Kaliakair', 'Sreepur', 'Kapasia', 'Kaliganj'
    ],
    Narayanganj: [
        'Narayanganj Sadar', 'Bandar', 'Fatullah', 'Siddhirganj', 'Rupganj', 'Araihazar', 'Sonargaon'
    ],
    Sylhet: [
        'Sylhet Sadar', 'Beanibazar', 'Golapganj', 'Zakiganj', 'Balaganj', 'Fenchuganj',
        'Bishwanath', 'Osmani Nagar', 'South Surma', 'Gowainghat', 'Kanaighat'
    ],
    Rajshahi: [
        'Boalia', 'Motihar', 'Rajpara', 'Shah Makhdum', 'Paba', 'Godagari', 'Tanore',
        'Mohanpur', 'Bagmara', 'Durgapur', 'Bagha', 'Charghat', 'Puthia'
    ],
    Khulna: [
        'Kotwali', 'Sonadanga', 'Khalishpur', 'Daulatpur', 'Khan Jahan Ali', 'Rupsha',
        'Phultala', 'Dighalia', 'Dumuria', 'Batiaghata', 'Koyra', 'Paikgachha'
    ],
    Barisal: [
        'Barisal Sadar', 'Babuganj', 'Bakerganj', 'Banaripara', 'Gournadi', 'Agailjhara',
        'Mehendiganj', 'Muladi', 'Hizla', 'Wazirpur'
    ],
    Rangpur: [
        'Rangpur Sadar', 'Badarganj', 'Mithapukur', 'Pirganj', 'Kaunia', 'Gangachara',
        'Taraganj', 'Pirgachha'
    ],
    Mymensingh: [
        'Mymensingh Sadar', 'Muktagachha', 'Trishal', 'Bhaluka', 'Phulpur', 'Gafargaon',
        'Gouripur', 'Haluaghat', 'Dhobaura', 'Ishwarganj', 'Nandail', 'Tara Khanda'
    ],
    Comilla: [
        'Comilla Adarsha Sadar', 'Comilla Sadar Dakshin', 'Debidwar', 'Chandina', 'Daudkandi',
        'Muradnagar', 'Laksam', 'Chauddagram', 'Burichang', 'Brahmanpara', 'Barura'
    ],
    Bogra: [
        'Bogra Sadar', 'Shibganj', 'Sherpur', 'Shajahanpur', 'Gabtali', 'Dhunat',
        'Adamdighi', 'Nandigram', 'Kahaloo', 'Dupchanchia', 'Sariakandi', 'Sonatola'
    ],
    "Cox's Bazar": [
        "Cox's Bazar Sadar", 'Chakaria', 'Maheshkhali', 'Teknaf', 'Ramu', 'Ukhiya',
        'Pekua', 'Kutubdia'
    ],
    Jessore: [
        'Kotwali', 'Jhikargachha', 'Keshabpur', 'Abhaynagar', 'Manirampur', 'Sharsha',
        'Bagherpara', 'Chaugachha'
    ],
};

function generatePassword(length = 10) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
    let res = '';
    for (let i = 0; i < length; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
}

export default function AddNewClientPage() {
    const router = useRouter();
    const queryClient = useQueryClient();

    // Queries for select dependencies
    const packagesQuery = useQuery({
        queryKey: queryKeys.packages.all(),
        queryFn: () => packageApi.list({ page_size: 100 }),
    });

    const routersQuery = useQuery({
        queryKey: queryKeys.routers.all(),
        queryFn: () => routerApi.list({ page_size: 100 }),
    });

    const branchesQuery = useQuery({
        queryKey: queryKeys.branches.all(),
        queryFn: () => branchesApi.list({ page_size: 100 }),
    });

    const tjBoxesQuery = useQuery({
        queryKey: queryKeys.tjBoxes.all(),
        queryFn: () => tjBoxesApi.list({ page_size: 100 }),
    });

    // Form state matching screenshot
    const [fullName, setFullName] = useState('');
    const [primaryPhone, setPrimaryPhone] = useState('');
    const [alternatePhone, setAlternatePhone] = useState('');
    const [email, setEmail] = useState('');
    const [nationalId, setNationalId] = useState('');
    const [pppoeUsername, setPppoeUsername] = useState('admin');
    const [pppoePassword, setPppoePassword] = useState('admin123');
    const [showPassword, setShowPassword] = useState(false);
    const [clientCode, setClientCode] = useState('');
    const [profilePicName, setProfilePicName] = useState('');
    const [address, setAddress] = useState('');
    const [district, setDistrict] = useState('Dhaka');
    const [thana, setThana] = useState('Mirpur');

    // Section 2: Package & Billing
    const [selectedPackageId, setSelectedPackageId] = useState('');
    const [discount, setDiscount] = useState<number | string>(0);
    const [billAmount, setBillAmount] = useState<number | string>(0);
    const [billingPosition, setBillingPosition] = useState('Active (Billable)');
    const [clientStatus, setClientStatus] = useState('Active');
    const [joiningDate, setJoiningDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [billingCycleDay, setBillingCycleDay] = useState('Standard 30 Days');
    const [autoRecharge, setAutoRecharge] = useState('Disabled');
    const [autoRechargeDuration, setAutoRechargeDuration] = useState('30 Days');
    const [smsNotifications, setSmsNotifications] = useState('Enabled (Send SMS)');
    const [voiceNotifications, setVoiceNotifications] = useState('Enabled (Send Voice Call)');

    // Section 3: Network & Location
    const [routerId, setRouterId] = useState('');
    const [zoneConfig, setZoneConfig] = useState('Default / No Zone');
    const [tjBoxId, setTjBoxId] = useState('');
    const [connectionType, setConnectionType] = useState('Fiber (FTTH)');
    const [clientType, setClientType] = useState('Home');
    const [onuMac, setOnuMac] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [isFetchingGps, setIsFetchingGps] = useState(false);
    const [remarks, setRemarks] = useState('');

    // Section 4: BTRC / Regulatory
    const [btrcConnectivityType, setBtrcConnectivityType] = useState('Shared');
    const [btrcAllocatedIpType, setBtrcAllocatedIpType] = useState('Shared');
    const [btrcAllocatedIp, setBtrcAllocatedIp] = useState('');
    const [btrcHouseNo, setBtrcHouseNo] = useState('');
    const [btrcRoadNo, setBtrcRoadNo] = useState('');
    const [btrcArea, setBtrcArea] = useState('');
    const [btrcDistributionPoint, setBtrcDistributionPoint] = useState('');

    // Username availability state
    const [usernameStatus, setUsernameStatus] = useState<{
        checking: boolean;
        available?: boolean;
        message?: string;
    }>({ checking: false });
    const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-calculate bill amount when package or discount changes
    useEffect(() => {
        const pkgs = packagesQuery.data ?? [];
        const selected = pkgs.find(p => p.id === selectedPackageId);
        if (selected) {
            const regular = Number(selected.regular_price || 0);
            const disc = Number(discount || 0);
            const net = Math.max(0, regular - disc);
            setBillAmount(net);
        }
    }, [selectedPackageId, discount, packagesQuery.data]);

    // Update Thana list when District changes
    const availableThanas = useMemo(() => {
        return BD_LOCATIONS[district] || ['Main Town', 'Sadar'];
    }, [district]);

    useEffect(() => {
        if (!availableThanas.includes(thana)) {
            setThana(availableThanas[0] || '');
        }
    }, [district, availableThanas, thana]);

    // Check username availability with debounce
    useEffect(() => {
        const trimmed = pppoeUsername.trim();
        if (!trimmed) {
            setUsernameStatus({ checking: false });
            return;
        }

        if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);

        setUsernameStatus({ checking: true });
        checkTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await customerApi.checkUsername(trimmed);
                setUsernameStatus({
                    checking: false,
                    available: res.available,
                    message: res.available ? 'Username is available' : 'This username is already taken',
                });
            } catch {
                setUsernameStatus({ checking: false });
            }
        }, 500);

        return () => {
            if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
        };
    }, [pppoeUsername]);

    // GPS location detection
    const handleFetchLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser.');
            return;
        }
        setIsFetchingGps(true);
        navigator.geolocation.getCurrentPosition(
            pos => {
                setLatitude(pos.coords.latitude.toFixed(7));
                setLongitude(pos.coords.longitude.toFixed(7));
                setIsFetchingGps(false);
            },
            err => {
                setIsFetchingGps(false);
                alert(`Could not fetch location: ${err.message}`);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // Client registration mutation
    const createMutation = useMutation(
        withMutationToast(
            {
                mutationFn: async (payload: CustomerCreatePayload) => {
                    return customerApi.create(payload);
                },
                onSuccess: (data) => {
                    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
                    if (data?.id) {
                        router.push(`/tenant/customers/${data.id}`);
                    } else {
                        router.push('/tenant/customers');
                    }
                },
            },
            {
                success: 'Client registered and profile saved successfully!',
                error: 'Failed to register client. Please review form fields.',
            }
        )
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!fullName.trim()) {
            alert('Full Name is required.');
            return;
        }
        if (!primaryPhone.trim()) {
            alert('Primary Phone No is required.');
            return;
        }
        if (!pppoeUsername.trim()) {
            alert('PPPoE ID / Username is required.');
            return;
        }

        const payload: CustomerCreatePayload = {
            full_name: fullName.trim(),
            mobile: primaryPhone.trim(),
            alternate_phone: alternatePhone.trim() || undefined,
            email: email.trim() || undefined,
            national_id: nationalId.trim() || undefined,
            customer_code: clientCode.trim() || undefined,
            address: address.trim() || undefined,
            district: district || undefined,
            thana: thana || undefined,
            area_zone: zoneConfig === 'Default / No Zone' ? 'Main Zone' : zoneConfig,
            client_type: clientType,
            connection_type: connectionType === 'Static / Dedicated IP' ? 'Static_IP' : connectionType.toLowerCase().includes('dhcp') ? 'DHCP' : 'PPPoE',
            pppoe_username: pppoeUsername.trim(),
            pppoe_password: pppoePassword || undefined,
            package: selectedPackageId || undefined,
            router: routerId || undefined,
            tj_box: tjBoxId || undefined,
            monthly_bill: billAmount,
            discount: discount,
            billing_type: billingPosition.toLowerCase().includes('free') ? 'Free' : billingPosition.toLowerCase().includes('post') ? 'Postpaid' : 'Prepaid',
            billing_cycle_day: billingCycleDay,
            auto_recharge: autoRecharge === 'Enabled',
            auto_recharge_duration: autoRechargeDuration,
            sms_notifications: smsNotifications.startsWith('Enabled'),
            voice_notifications: voiceNotifications.startsWith('Enabled'),
            joining_date: joiningDate,
            bill_date: joiningDate,
            status: clientStatus,
            onu_mac_or_sn: onuMac.trim() || undefined,
            latitude: latitude ? parseFloat(latitude) : undefined,
            longitude: longitude ? parseFloat(longitude) : undefined,
            remarks: remarks.trim() || undefined,
            btrc_info: {
                connectivity_type: btrcConnectivityType,
                allocated_ip_type: btrcAllocatedIpType,
                allocated_ip: btrcAllocatedIp.trim() || undefined,
                house_no: btrcHouseNo.trim() || undefined,
                road_no: btrcRoadNo.trim() || undefined,
                area: btrcArea.trim() || undefined,
                distribution_point: btrcDistributionPoint.trim() || undefined,
            },
        };

        await createMutation.mutateAsync(payload);
    };

    return (
        <div className="mx-auto max-w-6xl space-y-6 pb-16">
            {/* Header & Back link */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Link href="/tenant/customers" className="hover:text-foreground">
                            Client Management
                        </Link>
                        <span>/</span>
                        <span className="font-medium text-foreground">Add New Client</span>
                    </div>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <UserPlus className="size-6 text-primary" />
                        Add New Client / Broadband User
                    </h1>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/tenant/customers')}
                    className="gap-1.5 self-start sm:self-auto"
                >
                    <ArrowLeft className="size-4" />
                    Back to Clients
                </Button>
            </div>

            {/* Main Form Container */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Banner title card styled in base global theme */}
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-primary flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2.5 font-semibold text-sm sm:text-base">
                        <UserPlus className="size-5" />
                        <span>Add New Client / Broadband User</span>
                    </div>
                    <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 text-xs font-mono">
                        Quick Onboarding
                    </Badge>
                </div>

                {/* Section 1: Client Identity */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs shadow-xs">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <User className="size-4 text-primary" />
                            Client Identity
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Personal credentials, National ID, and regional location for this user.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">
                                Full Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                placeholder="Enter Client Name"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">
                                Primary Phone No <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                placeholder="e.g. 01711000000"
                                value={primaryPhone}
                                onChange={e => setPrimaryPhone(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Alternate Phone</Label>
                            <Input
                                placeholder="Optional Number"
                                value={alternatePhone}
                                onChange={e => setAlternatePhone(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Email</Label>
                            <Input
                                type="email"
                                placeholder="client@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">
                                National ID (NID) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                placeholder="NID Number"
                                value={nationalId}
                                onChange={e => setNationalId(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium">
                                    PPPoE ID / Username <span className="text-destructive">*</span>
                                </Label>
                                {usernameStatus.checking ? (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Loader2 className="size-3 animate-spin" /> Checking
                                    </span>
                                ) : usernameStatus.available === true ? (
                                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                        <CheckCircle2 className="size-3" /> Available
                                    </span>
                                ) : usernameStatus.available === false ? (
                                    <span className="flex items-center gap-1 text-[11px] text-destructive font-medium">
                                        <XCircle className="size-3" /> Taken
                                    </span>
                                ) : null}
                            </div>
                            <Input
                                placeholder="admin"
                                value={pppoeUsername}
                                onChange={e => setPppoeUsername(e.target.value)}
                                className={
                                    usernameStatus.available === false
                                        ? 'border-destructive focus-visible:ring-destructive'
                                        : usernameStatus.available === true
                                        ? 'border-emerald-500 focus-visible:ring-emerald-500'
                                        : ''
                                }
                                required
                            />
                            {usernameStatus.message && (
                                <p
                                    className={`text-[11px] ${
                                        usernameStatus.available ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                    }`}
                                >
                                    {usernameStatus.message}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium">PPPoE Password</Label>
                                <button
                                    type="button"
                                    onClick={() => setPppoePassword(generatePassword())}
                                    className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                                >
                                    <Sparkles className="size-3" /> Generate
                                </button>
                            </div>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••••"
                                    value={pppoePassword}
                                    onChange={e => setPppoePassword(e.target.value)}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Client Code / Custom ID (Optional)</Label>
                            <Input
                                placeholder="Custom ID or Code"
                                value={clientCode}
                                onChange={e => setClientCode(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Profile Picture</Label>
                            <div className="flex items-center gap-2">
                                <label className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground cursor-pointer">
                                    <span>Choose File</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) setProfilePicName(file.name);
                                        }}
                                    />
                                </label>
                                <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                                    {profilePicName || 'No file chosen'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                            <Label className="text-xs font-medium">Address</Label>
                            <Input
                                placeholder="House, Street, Area Info"
                                value={address}
                                onChange={e => setAddress(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">
                                District <span className="text-destructive">*</span>
                            </Label>
                            <select
                                value={district}
                                onChange={e => setDistrict(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                {Object.keys(BD_LOCATIONS).map(d => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">
                                Thana / Upazila <span className="text-destructive">*</span>
                            </Label>
                            <select
                                value={thana}
                                onChange={e => setThana(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                {availableThanas.map(t => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </CardContent>
                </Card>

                {/* Section 2: Package & Billing Setup */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs shadow-xs">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <CreditCard className="size-4 text-primary" />
                            Package & Billing Setup
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Select subscriber plan, manage discounts, recurring cycle, and notification toggles.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Select Package</Label>
                            <select
                                value={selectedPackageId}
                                onChange={e => setSelectedPackageId(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="">-- Choose Package --</option>
                                {(packagesQuery.data ?? []).map(pkg => (
                                    <option key={pkg.id} value={pkg.id}>
                                        {pkg.name} ({pkg.speed_mbps || 0} Mbps - ৳{pkg.regular_price})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Discount (৳)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={discount}
                                onChange={e => setDiscount(e.target.value)}
                                placeholder="0"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Bill Amount</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                                    ৳
                                </span>
                                <Input
                                    type="number"
                                    min="0"
                                    value={billAmount}
                                    onChange={e => setBillAmount(e.target.value)}
                                    className="pl-7 font-mono font-medium"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Billing Position / Status</Label>
                            <select
                                value={billingPosition}
                                onChange={e => setBillingPosition(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Active (Billable)">Active (Billable)</option>
                                <option value="Free (Complimentary)">Free (Complimentary)</option>
                                <option value="Staff / Internal">Staff / Internal</option>
                                <option value="VIP / Corporate Demo">VIP / Corporate Demo</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Client Status</Label>
                            <select
                                value={clientStatus}
                                onChange={e => setClientStatus(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Active">Active</option>
                                <option value="Suspended">Suspended</option>
                                <option value="Expired">Expired</option>
                                <option value="Left">Terminated / Left</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Joining Date</Label>
                            <Input
                                type="date"
                                value={joiningDate}
                                onChange={e => setJoiningDate(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Billing Cycle Day</Label>
                            <select
                                value={billingCycleDay}
                                onChange={e => setBillingCycleDay(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Standard 30 Days">Standard 30 Days</option>
                                <option value="1st of Calendar Month">1st of Calendar Month</option>
                                <option value="5th of Month">5th of Month</option>
                                <option value="10th of Month">10th of Month</option>
                                <option value="15th of Month">15th of Month</option>
                            </select>
                            <p className="text-[10px] text-muted-foreground">Calculates pro-rata credit till this day.</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium flex items-center gap-1.5">
                                <RefreshCw className="size-3 text-primary" />
                                Auto Recharge
                            </Label>
                            <select
                                value={autoRecharge}
                                onChange={e => setAutoRecharge(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Disabled">Disabled</option>
                                <option value="Enabled">Enabled</option>
                            </select>
                            <p className="text-[10px] text-muted-foreground">Expiry হলে automatically Due recharge হবে.</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Auto Recharge Duration</Label>
                            <select
                                value={autoRechargeDuration}
                                onChange={e => setAutoRechargeDuration(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="30 Days">30 Days</option>
                                <option value="15 Days">15 Days</option>
                                <option value="60 Days">60 Days</option>
                                <option value="90 Days">90 Days</option>
                            </select>
                            <p className="text-[10px] text-muted-foreground">30 days অথবা নিজের মতো validity দিন নির্বাচন করুন.</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">SMS Notifications</Label>
                            <select
                                value={smsNotifications}
                                onChange={e => setSmsNotifications(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Enabled (Send SMS)">Enabled (Send SMS)</option>
                                <option value="Disabled">Disabled</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Voice Call Notifications</Label>
                            <select
                                value={voiceNotifications}
                                onChange={e => setVoiceNotifications(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Enabled (Send Voice Call)">Enabled (Send Voice Call)</option>
                                <option value="Disabled">Disabled</option>
                            </select>
                        </div>
                    </CardContent>
                </Card>

                {/* Section 3: Network & Location */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs shadow-xs">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Network className="size-4 text-primary" />
                            Network & Location
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Physical POP router, fiber TJ Box port, ONU hardware MAC, and geographic location.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Router / POP</Label>
                            <select
                                value={routerId}
                                onChange={e => setRouterId(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="">-- Select Router / POP --</option>
                                {(routersQuery.data ?? []).map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.name} ({r.ip_address})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Zone Configuration</Label>
                            <select
                                value={zoneConfig}
                                onChange={e => setZoneConfig(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Default / No Zone">Default / No Zone</option>
                                {(branchesQuery.data ?? []).map(b => (
                                    <option key={b.id} value={b.name}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">TJ Box / Port</Label>
                            <select
                                value={tjBoxId}
                                onChange={e => setTjBoxId(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="">None / Direct</option>
                                {(tjBoxesQuery.data ?? []).map(box => (
                                    <option key={box.id} value={box.id}>
                                        {box.name} ({box.zone_name || box.box_category})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Connection Type</Label>
                            <select
                                value={connectionType}
                                onChange={e => setConnectionType(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Fiber (FTTH)">Fiber / PPPoE (FTTH)</option>
                                <option value="Cat5 / Cat6 Cable">Cat5 / Cat6 (PPPoE)</option>
                                <option value="Wireless (PtP / PtMP)">Wireless PtP / PtMP (PPPoE)</option>
                                <option value="Static / Dedicated IP">Static / Dedicated IP</option>
                                <option value="DHCP / IPoE">DHCP / IPoE</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">
                                Client Type <span className="text-destructive">*</span>
                            </Label>
                            <select
                                value={clientType}
                                onChange={e => setClientType(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Home">Home</option>
                                <option value="Corporate">Corporate</option>
                                <option value="SME">SME</option>
                                <option value="Reseller Sub">Reseller Sub</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">ONU MAC Address</Label>
                            <Input
                                placeholder="e.g. AA:BB:CC:11:22:33"
                                value={onuMac}
                                onChange={e => setOnuMac(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs font-medium flex items-center justify-between">
                                <span>GPS Coordinates (Lat, Long)</span>
                                <button
                                    type="button"
                                    onClick={handleFetchLocation}
                                    disabled={isFetchingGps}
                                    className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                                >
                                    {isFetchingGps ? (
                                        <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                        <MapPin className="size-3" />
                                    )}
                                    {isFetchingGps ? 'Locating…' : 'Detect GPS'}
                                </button>
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    placeholder="Latitude (e.g. 23.8103)"
                                    value={latitude}
                                    onChange={e => setLatitude(e.target.value)}
                                />
                                <Input
                                    placeholder="Longitude (e.g. 90.4125)"
                                    value={longitude}
                                    onChange={e => setLongitude(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                            <Label className="text-xs font-medium">Remarks</Label>
                            <Input
                                placeholder="Any notes..."
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Section 4: BTRC / Regulatory Information */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs shadow-xs">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <FileText className="size-4 text-primary" />
                            BTRC / Regulatory Information
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Mandatory compliance fields required for Bangladesh Telecommunication Regulatory Commission reports.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Connectivity Type</Label>
                            <select
                                value={btrcConnectivityType}
                                onChange={e => setBtrcConnectivityType(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Shared">Shared</option>
                                <option value="Dedicated">Dedicated</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Allocated IP Type</Label>
                            <select
                                value={btrcAllocatedIpType}
                                onChange={e => setBtrcAllocatedIpType(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="Shared">Shared</option>
                                <option value="Public / Static">Public / Static</option>
                                <option value="Private CGNAT">Private CGNAT</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Allocated IP</Label>
                            <Input
                                placeholder="e.g. 103.x.x.x or 10.x.x.x"
                                value={btrcAllocatedIp}
                                onChange={e => setBtrcAllocatedIp(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">House No</Label>
                            <Input
                                placeholder="House / Holding"
                                value={btrcHouseNo}
                                onChange={e => setBtrcHouseNo(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Road No / Road Name</Label>
                            <Input
                                placeholder="Road / Lane"
                                value={btrcRoadNo}
                                onChange={e => setBtrcRoadNo(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Area</Label>
                            <Input
                                placeholder="Area / Locality"
                                value={btrcArea}
                                onChange={e => setBtrcArea(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs font-medium">Distribution Location Point</Label>
                            <Input
                                placeholder="POP / distribution point address"
                                value={btrcDistributionPoint}
                                onChange={e => setBtrcDistributionPoint(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                If blank, report uses TJ Box → Zone → Router as fallback.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Submit Action Button */}
                <div className="pt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push('/tenant/customers')}
                        disabled={createMutation.isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={createMutation.isPending || usernameStatus.available === false}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 text-sm font-semibold shadow-sm gap-2"
                    >
                        {createMutation.isPending ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                Registering Client…
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="size-4" />
                                Register New Client & Save Profile
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
