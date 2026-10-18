import type { PaginatedResponse } from '../errors';

/* ── SaaS / central plane ────────────────────────────────────────────── */

export interface Tenant {
    id: string;
    name: string;
    schema_name: string;
    domain_url: string;
    plan?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    subscription_status?: string;
    organization_id?: string | null;
    organization_name?: string | null;
    organization_slug?: string | null;
}

export interface SaasDomain {
    id: string;
    domain: string;
    tenant_id: string;
    tenant_name?: string;
    is_primary: boolean;
    is_active: boolean;
    ssl_active?: boolean;
    created_at?: string;
}

export interface OnboardingRequest {
    id: string;
    company_name: string;
    email: string;
    phone?: string;
    plan_requested?: string;
    notes?: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    // Additional fields exposed by the backend serializer (`__all__`).
    contact_name?: string;
    requested_slug?: string;
    requested_domain?: string;
    address?: string;
    admin_notes?: string;
    payment_method?: string;
    payment_sender?: string;
    payment_trx_id?: string;
    payment_amount?: number;
}

export interface PlatformPaymentConfig {
    id?: string;
    bkash_number: string;
    bkash_account_type: string;
    bkash_instructions: string;
    is_active: boolean;
    updated_at?: string;
}

export interface TenantRequestInput {
    tenant_name: string;
    tenant_slug: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    package_id?: string;
    requested_plan?: string;
    payment_sender: string;
    payment_trx_id: string;
    payment_amount?: number;
}

export interface MyTenantRequestItem {
    id: string;
    tenant_name: string;
    requested_slug: string;
    requested_plan: string;
    status: 'pending' | 'approved' | 'rejected';
    payment_method: string;
    payment_sender: string;
    payment_trx_id: string;
    payment_amount: number;
    admin_notes?: string;
    created_at?: string;
}

export interface OrganizationMember {
    id: string;
    organization: string;
    user: number;
    username: string;
    email: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'BILLING';
    is_active: boolean;
    invited_at: string;
    accepted_at: string | null;
    updated_at: string;
}

export interface Organization {
    id: string;
    name: string;
    slug: string;
    contact_phone: string;
    contact_email: string;
    address: string;
    max_tenants: number | null;
    is_active: boolean;
    notes: string;
    created_at: string;
    updated_at: string;
    tenant_count: number;
    active_tenant_count: number;
    members?: OrganizationMember[];
}

export interface OrganizationSummary extends Organization {
    member_count: number;
    active_subscription_count: number;
    owner_email: string | null;
}

export interface CreateOrganizationInput {
    name: string;
    slug?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    max_tenants?: number | null;
    is_active?: boolean;
    notes?: string;
}

export interface CreateOrganizationWithFirstTenantInput {
    org_name: string;
    org_slug?: string;
    org_contact_phone?: string;
    org_contact_email?: string;
    org_address?: string;
    org_max_tenants?: number | null;
    tenant_name: string;
    tenant_slug: string;
    tenant_domain?: string;
    package?: string | null;
    owner_username?: string;
    owner_email?: string;
    owner_password?: string;
    owner_first_name?: string;
    owner_last_name?: string;
    owner_phone?: string;
    billing_cycle?: 'monthly' | 'yearly';
    trial_days?: number;
}

export interface CreateOrganizationWithFirstTenantResult {
    organization: OrganizationSummary;
    tenant: {
        id: string;
        name: string;
        slug: string;
        plan: string;
        subscription_status: string;
        is_active: boolean;
    };
    owner: {
        id: number;
        username: string;
        email: string;
        first_name: string;
        last_name: string;
    };
    owner_membership: OrganizationMember;
    subscription: {
        id: string;
        status: string;
        billing_cycle: string;
        price: string;
    };
    generated_password?: string;
    default_admin_url: string;
}

export interface SaasPackage {
    id: string;
    name: string;
    price: number;
    currency: string;
    description?: string;
    monthly_price?: number | string;
    yearly_price?: number | string;
    max_subscribers?: number;
    max_routers?: number;
    code?: string;
    billing_interval?: 'monthly' | 'yearly';
    features: string[];
    is_active: boolean;
    subscriber_count?: number;
}

export interface SaasSubscription {
    id: string;
    tenant_id: string;
    tenant_name?: string;
    package_id: string;
    package_name?: string;
    status: 'active' | 'past_due' | 'canceled' | 'unpaid';
    current_period_end: string;
    created_at?: string;
}

export interface SaasPayment {
    id: string;
    subscription_id: string;
    tenant_name?: string;
    amount: number;
    currency?: string;
    payment_method?: string;
    status: 'succeeded' | 'pending' | 'failed' | 'refunded';
    created_at: string;
}

export interface SaasBackup {
    id: string;
    tenant_id: string;
    tenant_name?: string;
    backup_type?: 'full' | 'database' | 'media';
    status: 'completed' | 'in_progress' | 'failed';
    size_bytes: number;
    created_at: string;
}

export interface SaasAuditLog {
    id: string;
    action: string;
    user_id: string;
    tenant_id?: string;
    details: Record<string, unknown>;
    ip_address?: string;
    created_at: string;
}

export interface SaasDashboardOverview {
    total_tenants: number;
    active_subscriptions: number;
    mrr: number;
    pending_onboarding: number;
    total_revenue?: number;
    storage_used_bytes?: number;
    system_health?: 'healthy' | 'warning' | 'degraded';
    suspended_tenants?: number;
    total_subscribers?: number;
    active_subscribers?: number;
    total_routers?: number;
    online_routers?: number;
    total_pops?: number;
    active_pops?: number;
    total_olts?: number;
    total_onus?: number;
    online_onus?: number;
    total_staff?: number;
    total_packages?: number;
    annual_run_rate?: number;
    cluster_status?: string;
    redis_latency_ms?: number;
    sla_target?: string;
}

export interface SaasEmployee {
    id: string | number;
    worker_id?: string;
    employee_code?: string;
    full_name: string;
    email: string;
    phone?: string;
    role: string;
    designation?: string;
    worker_type?: string;
    department?: string;
    is_active: boolean;
    joining_date?: string;
    basic_salary?: number;
    created_at?: string;
    tenant?: string;
    tenant_name?: string;
}

export interface FeatureMatrixResponse {
    features: Array<{ key: string; label: string; category: string; description?: string; paid?: boolean }>;
    matrix: Record<string, Record<string, boolean>>;
}

/* ── ISP-Admin plane (parent SaaS subscriber) ───────────────────────── */

export interface IspAdminOverview {
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    plan: string;
    subscription_status: string;
    subscription_expires_at: string | null;
    domain_count: number;
    verified_domain_count: number;
    enabled_modules_count: number;
    total_modules_count: number;
    staff_count: number;
    child_tenant_count: number;
    child_tenant_active_count: number;
    aggregate_subscriber_count: number;
}

export interface IspAdminDomain {
    id: string;
    hostname: string;
    domain_type: string;
    is_primary: boolean;
    is_active: boolean;
    verified: boolean;
    verified_at: string | null;
    verification_method: string | null;
    dns_challenge_token: string;
    created_at: string;
    updated_at: string;
}

export interface IspAdminModule {
    key: string;
    label: string;
    category: string;
    paid: boolean;
    enabled: boolean;
    is_override: boolean;
    config: Record<string, unknown>;
}

export interface IspAdminModuleSubscription {
    tenant_id: string;
    features: IspAdminModule[];
    overrides: Array<{
        feature_key: string;
        enabled: boolean;
        config: Record<string, unknown>;
        enabled_at: string | null;
        updated_at: string | null;
    }>;
}

export interface IspAdminChildTenant {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    subscription_status: string;
    plan: string;
    max_subscribers: number;
    max_routers: number;
    created_at: string;
    domain_count: number;
    customer_count: number;
    admin_username: string | null;
    admin_email: string | null;
}

export interface IspAdminChildTenantOverview {
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    is_active: boolean;
    subscription_status: string;
    domain_count: number;
    enabled_modules_count: number;
    customer_count: number;
}

export interface IspAdminChildAdminUser {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    is_active: boolean;
    phone: string;
}

export interface IspAdminImpersonateResponse {
    token: string;
    tenant_slug: string;
    tenant_id: string;
    admin_username: string;
}

export interface IspAdminChildTenantCreatePayload {
    name: string;
    slug: string;
    admin_username: string;
    admin_password: string;
    domain?: string;
    plan?: string;
}

/* ── Tenant plane (staff) ─────────────��────────────────────────────── */

export interface TenantLoginResponse {
    token?: string;
    session_token?: string;
    user?: Record<string, unknown>;
    tenant?: { id?: string; slug?: string; name?: string } | null;
    message?: string;
    requires_tenant_selection?: boolean;
    available_tenants?: Array<{ id: string; name: string; slug: string }>;
}

export interface IspAdminTenant {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    primary_hostname: string | null;
    tenant_url: string;
    role: string | null;
    plan: string | null;
    subscription_active: boolean;
    contact_email: string;
    contact_phone: string;
    logo_url: string;
    address: string;
    created_at: string | null;
}

export interface TenantResolveResponse {
    id: string;
    slug: string;
    name: string;
    domain: string;
    status: 'active' | 'suspended' | 'trial' | 'past_due';
    is_active: boolean;
    logo: string;
    favicon: string;
    branding: {
        company_name: string;
        tagline: string;
        theme_mode: 'light' | 'dark' | 'system' | 'midnight' | 'cyberpunk';
        accent_color: string;
        primary_color: string;
        secondary_color: string;
        currency_symbol: string;
        currency_code: string;
        support_phone: string;
        support_email: string;
        website: string;
    };
    enabled_modules: string[];
}

export interface BtrcInfo {
    connectivity_type?: string;
    allocated_ip_type?: string;
    allocated_ip?: string;
    house_no?: string;
    road_no?: string;
    area?: string;
    distribution_point?: string;
}

export interface Customer {
    id: string;
    customer_code: string;
    full_name: string;
    mobile: string;
    alternate_phone?: string;
    email?: string;
    national_id?: string;
    address?: string;
    district?: string;
    thana?: string;
    area_zone?: string;
    client_type?: string;
    connection_type?: CustomerConnectionType;
    pppoe_username: string;
    static_ip?: string;
    mac_address?: string;
    onu_mac_or_sn?: string;
    package?: string;
    package_name?: string;
    package_speed?: number;
    router?: string;
    router_name?: string;
    router_ip?: string;
    router_protocol?: string;
    router_status?: string;
    tj_box?: string;
    tj_box_name?: string;
    billing_type?: CustomerBillingType;
    monthly_bill: number | string;
    due_amount: number | string;
    advance_amount: number | string;
    discount: number | string;
    billing_cycle_day?: string;
    auto_recharge?: boolean;
    auto_recharge_duration?: string;
    sms_notifications?: boolean;
    voice_notifications?: boolean;
    bill_date?: string;
    expiry_date?: string;
    promise_date?: string;
    status: CustomerStatusType;
    latitude?: number | string;
    longitude?: number | string;
    remarks?: string;
    btrc_info?: BtrcInfo;
    services_count?: number;
    live_session?: { is_online: boolean; ip_address?: string; uptime?: string; mac_address?: string };
    created_at: string;
    updated_at?: string;
}

export type CustomerConnectionType = 'PPPoE' | 'Static_IP' | 'DHCP' | (string & {});
export type CustomerBillingType = 'Prepaid' | 'Postpaid' | 'Free' | (string & {});
export type CustomerStatusType = 'Active' | 'Expired' | 'Suspended' | 'Left' | 'Archived' | (string & {});

export interface CustomerCreatePayload {
    customer_code?: string;
    full_name: string;
    mobile: string;
    alternate_phone?: string;
    email?: string;
    national_id?: string;
    address?: string;
    district?: string;
    thana?: string;
    area_zone?: string;
    client_type?: string;
    connection_type?: CustomerConnectionType;
    pppoe_username: string;
    pppoe_password?: string;
    package?: string;
    router?: string;
    tj_box?: string;
    monthly_bill?: number | string;
    discount?: number | string;
    billing_type?: CustomerBillingType;
    billing_cycle_day?: string;
    auto_recharge?: boolean;
    auto_recharge_duration?: string;
    sms_notifications?: boolean;
    voice_notifications?: boolean;
    joining_date?: string;
    bill_date?: string;
    status?: CustomerStatusType;
    static_ip?: string;
    mac_address?: string;
    onu_mac_or_sn?: string;
    latitude?: number | string;
    longitude?: number | string;
    remarks?: string;
    btrc_info?: BtrcInfo;
}

export interface CustomerService {
    id: string;
    tenant: string;
    customer: string;
    customer_name?: string;
    customer_code?: string;
    package?: string;
    package_name?: string;
    package_speed?: number;
    service_type: string;
    service_identifier: string;
    status: string;
    activation_date?: string;
    termination_date?: string;
    monthly_price: number | string;
    router?: string;
    router_name?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}

export interface CustomerSubscription {
    id: string;
    tenant: string;
    customer: string;
    customer_name?: string;
    customer_code?: string;
    service: string;
    service_identifier?: string;
    service_type?: string;
    package?: string;
    package_name?: string;
    billing_cycle: string;
    price: number | string;
    discount: number | string;
    status: string;
    start_date: string;
    next_billing_date?: string;
    end_date?: string;
    auto_renew: boolean;
    created_at: string;
    updated_at: string;
}

export interface IspPackage {
    id: string;
    name: string;
    mikrotik_profile: string;
    speed_mbps: number;
    upload_speed_mbps?: number;
    validity_days: number;
    regular_price: number | string;
    min_reseller_price?: number | string;
    description?: string;
    is_active: boolean;
    subscribers_count?: number;
    created_at?: string;
}

export interface Invoice {
    id: string;
    invoice_no: string;
    customer: string;
    customer_name?: string;
    customer_username?: string;
    service?: string;
    service_identifier?: string;
    subscription?: string;
    billing_month: string;
    package_name: string;
    package_amount: number | string;
    previous_due: number | string;
    discount: number | string;
    total_payable: number | string;
    paid_amount: number | string;
    due_amount: number | string;
    status: string;
    due_date?: string;
    created_at: string;
}

export interface PaymentTransaction {
    id: string;
    customer?: string;
    customer_name?: string;
    customer_username?: string;
    subscription?: string;
    invoice?: string;
    amount: number | string;
    fee?: number | string;
    net_amount?: number | string;
    currency?: string;
    payment_method?: string;
    gateway?: string;
    trx_id?: string;
    status: string;
    paid_at?: string;
    created_at: string;
}

export interface Router {
    id: string;
    name: string;
    hostname?: string;
    ip_address?: string;
    api_port?: number;
    status: string;
    cpu_load?: number;
    memory_usage?: number;
    uptime?: string;
    last_sync_at?: string;
    active_pppoe_count?: number;
}

export interface NetworkProfile {
    id: string;
    name: string;
    download_speed: number;
    upload_speed: number;
    rate_limit?: string;
    burst_limit?: string;
    is_active: boolean;
    created_at: string;
}

export interface PPPoEAccount {
    id: string;
    username: string;
    password?: string;
    customer?: string;
    customer_name?: string;
    profile?: string;
    service?: string;
    status: string;
    ip_address?: string;
    last_seen?: string;
    created_at: string;
}

export interface Olt {
    id: string;
    name: string;
    vendor?: string;
    brand?: string;
    access_mode?: string;
    cli_access_mode?: string;
    connection_path?: string;
    ip_address?: string;
    location?: string;
    lat_long?: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    status: string;
    pon_ports?: number;
    pon_ports_count?: number;
    online_onus?: number;
    total_onus?: number;
    snmp_port?: number;
    snmp_retries?: number;
    snmp_timeout?: number;
    poll_interval?: number;
    cli_enabled?: boolean;
    telnet_port?: number;
    telnet_user?: string;
    cli_timeout?: number;
    last_poll_at?: string;
    last_sync?: string;
    created_at: string;
}

export interface PptpVpnConfig {
    id?: string;
    server_ip: string;
    username: string;
    lan_subnet: string;
    require_mppe: boolean;
    auto_connect: boolean;
    route_metric: number;
    status: 'Disabled' | 'Connecting' | 'Connected' | 'Failed';
    active_interface: string;
    tunnel_reachability: string;
    last_health_check: string | null;
    last_handshake: string | null;
    last_olt_reachable: string | null;
    has_password?: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface SMSGatewayDevice {
    id: string;
    provider: 'bKash' | 'Nagad' | 'Rocket' | 'Upay';
    merchant_number?: string;
    device_id: string;
    api_token?: string;
    checkout_enabled: boolean;
    account_type: 'Personal' | 'Merchant' | 'Agent';
    instruction_type: 'Send Money' | 'Payment' | 'Cash In';
    checkout_expiry_minutes: number;
    status: 'Active' | 'Inactive';
    last_seen_at?: string | null;
    created_at: string;
    updated_at?: string;
}

export interface PaymentVerificationRequest {
    id: string;
    client_pppoe_id: string;
    invoice_id?: string;
    gateway: string;
    amount: number | string;
    transaction_id: string;
    status: 'Pending' | 'Verified' | 'Rejected' | 'Matched';
    submitted_at: string;
    verified_at?: string | null;
    customer_name?: string;
    matched_sms_text?: string;
    notes?: string;
}

export interface VerificationSmsLog {
    id: string;
    device_id?: string;
    gateway?: string;
    sender: string;
    raw_message: string;
    parsed_provider?: string;
    parsed_amount?: number | string | null;
    parsed_trx_id?: string;
    parsed_account?: string;
    is_matched: boolean;
    matched_customer?: string | null;
    matched_customer_name?: string | null;
    created_at: string;
}

export interface PaymentVerificationStats {
    active_devices: string;
    active_devices_count: number;
    total_devices_count: number;
    pending_requests: number;
    verified_payments: number;
    success_match_rate: string;
}

export interface BranchUserStats {
    total_clients: number;
    active_clients: number;
    inactive_clients: number;
    expired_clients: number;
    free_clients: number;
    left_clients: number;
    online_count: number;
    offline_count: number;
    bill: number;
    cost: number;
}

export interface BranchMetrics {
    total_clients: {
        count: number;
        active: number;
        inactive: number;
        free: number;
        expired: number;
    };
    total_active: {
        count: number;
        bill: number;
        cost: number;
        online: number;
        offline: number;
    };
    total_due: {
        count: number;
        bill: number;
        cost: number;
    };
    total_inactive: {
        count: number;
        bill: number;
        cost: number;
    };
    total_left: {
        count: number;
        bill: number;
        cost: number;
    };
    branches_summary?: {
        total_active: number;
        total_left: number;
    };
}

export interface Branch {
    id: string;
    name: string;
    code?: string;
    location?: string;
    in_charge?: string;
    contact?: string;
    total_capacity?: number;
    power_backup?: string;
    status: string;
    latitude?: number | null;
    longitude?: number | null;

    // ISP Billing & Reseller extensions
    username?: string;
    password?: string;
    nid?: string;
    advance_balance_limit?: number | string;
    enable_undo_recharge?: boolean;
    user_expire_time?: string;
    enable_global_sms?: boolean;
    role?: string;
    upstream_router?: string | null;
    upstream_router_name?: string;
    allowed_packages?: string[];
    allowed_package_names?: string[];
    supervisor?: string | null;
    supervisor_name?: string;
    agent?: string | null;
    agent_name?: string;
    commission_type?: 'FIXED' | 'PACKAGE_WISE' | string;
    fixed_commission_amount?: number | string;
    balance?: number | string;
    due?: number | string;
    user_stats?: BranchUserStats;

    created_at?: string;
    updated_at?: string;
}

export type FiberCoreStatus = 'Free' | 'Connected' | 'Damaged' | 'Reserved';

export interface FiberCore {
    index: number;
    status: FiberCoreStatus;
    color: string;
    note?: string;
}

export interface FiberLine {
    id?: string;
    capacity: string;
    direction: 'In' | 'Out';
    brand?: string;
    code?: string;
    cores: FiberCore[];
    is_expanded?: boolean;
}

export type TJBoxCategory = 'Master Box' | 'Splitter Box' | 'Zone/point Box';

export interface TJBox {
    id: string;
    name: string;
    zone?: string | null;
    zone_name?: string | null;
    box_category: TJBoxCategory;
    fiber_code: FiberLine[];
    lat_long?: string;
    latitude?: number | null;
    longitude?: number | null;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface Onu {
    id: string;
    serial_number?: string;
    mac_address?: string;
    olt?: string;
    olt_name?: string;
    pon_port?: number;
    onu_index?: number;
    customer?: string;
    customer_name?: string;
    status: string;
    rx_signal_dbm?: number | string;
    last_seen?: string;
    created_at: string;
}

export interface TopologyNode {
    id: string;
    type: 'branch' | 'router' | 'olt' | 'onu' | 'customer';
    name: string;
    status?: string;
    parent_id?: string | null;
    metadata?: Record<string, unknown>;
}

export interface TopologyEdge {
    source: string;
    target: string;
    kind: 'backhaul' | 'distribution' | 'access' | 'customer';
    label?: string;
}

export interface Topology {
    nodes: TopologyNode[];
    edges: TopologyEdge[];
}

export interface CompanySetting {
    id: string;
    key: string;
    value: string;
    group?: string;
    description?: string;
    is_public?: boolean;
    updated_at?: string;
}

export interface Notification {
    id: string;
    tenant?: string | null;
    user?: number | string | null;
    title: string;
    message: string;
    category: string;
    priority: string;
    action_url?: string;
    is_read: boolean;
    read_at?: string | null;
    created_at: string;
}

export interface SearchResult {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    url: string;
    icon: string;
}

export interface TenantKpis {
    total_clients?: number;
    total_customers?: number;
    total_subscribers?: number;
    active_clients?: number;
    active_customers?: number;
    active_subscribers?: number;
    online_now?: number;
    offline_now?: number;
    due_clients?: number;
    expired_clients?: number;
    expired_customers?: number;
    inactive_clients?: number;
    suspended_customers?: number;
    joined_this_month?: number;
    expire_today?: number;
    expire_in_2_days?: number;
    expire_in_5_days?: number;
    left_clients?: number;
    free_clients?: number;
    promise_clients?: number;
    open_tickets?: number;
    todays_revenue?: number;
    today_collection?: number;
    month_collection?: number;
    monthly_revenue?: number;
    active_client_bill?: number;
    outstanding_bill?: number;
    total_due?: number;
    total_advance?: number;
    online_routers?: number;
    total_routers?: number;
    total_onus?: number;
    online_onus?: number;
    warning_onus?: number;
    critical_onus?: number;
    total_olts?: number;
    online_olts?: number;
    offline_olts?: number;
    total_branches?: number;
    left_branches?: number;
    total_agents?: number;
    pending_verifications?: number;
    verified_payments_count?: number;
    active_gateway_devices?: number;
    total_gateway_devices?: number;
}

export interface FinancialCommunicationItem {
    id: string;
    sender: string;
    message: string;
    amount?: number | null;
    trx_id?: string;
    provider: string;
    is_matched: boolean;
    customer_name?: string | null;
    customer_mobile?: string;
    created_at?: string | null;
}

export interface ClientDistribution {
    by_status?: Array<{ status: string; count: number; color?: string }>;
    top_packages?: Array<{ name: string; count: number }>;
}

export interface ActionRequiredItem {
    id: string;
    type: 'expiry' | 'promise' | 'network' | 'support' | string;
    severity: 'info' | 'warning' | 'danger';
    title: string;
    description: string;
    count?: number;
    href?: string;
}

export interface ActionRequired {
    expire_today?: number;
    expire_in_2_days?: number;
    expire_in_5_days?: number;
    broken_promises?: number;
    critical_onus?: number;
    offline_routers?: number;
    critical_tickets?: number;
    items?: ActionRequiredItem[];
}

export interface RecentActivityItem {
    id: string;
    type: 'payment' | 'ticket' | 'subscriber' | string;
    title: string;
    amount?: number | string | null;
    detail?: string;
    timestamp?: string | null;
    status?: string;
}

export interface DashboardAnalytics {
    role?: string;
    total_customers?: number;
    active_subscriptions?: number;
    total_due?: number | string;
    mrr?: number | string;
    kpis?: TenantKpis;
    monthly_trend?: Array<{ month: string; collection: number; target: number }>;
    traffic_distribution?: Array<{ time: string; download: number; upload: number }>;
    financial_communication_history?: FinancialCommunicationItem[];
    client_distribution?: ClientDistribution;
    action_required?: ActionRequired;
    recent_payments?: Array<{ id: string; amount: number | string; customer_name?: string; payment_method?: string; status?: string; trx_id?: string; created_at: string }>;
    recent_activity?: RecentActivityItem[];
    [key: string]: unknown;
}

/* ── Reseller plane ────────────────────────────────────────────────── */

export interface ResellerProfile {
    id: string;
    user?: { id: number; username: string; email?: string; full_name?: string };
    tenant?: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    status: 'active' | 'suspended' | 'inactive' | string;
    credit_limit: number | string;
    available_credit: number | string;
    wallet_balance: number | string;
    commission_pct?: number | string;
    created_at?: string;
}

export interface ResellerWallet {
    reseller_id: string;
    wallet_balance: string;
    currency: string;
    pending_holds: number | string;
    as_of: string;
}

export interface ResellerLedgerEntry {
    id: string;
    reseller: string;
    entry_type: 'CREDIT' | 'DEBIT' | string;
    amount: string;
    balance_after: string;
    reference?: string;
    description: string;
    created_at: string;
}

export interface ResellerHold {
    id: string;
    reseller: string;
    customer?: string;
    amount: string;
    status: 'PENDING' | 'RELEASED' | 'CONSUMED' | 'EXPIRED' | string;
    purpose: string;
    expires_at?: string;
    created_at: string;
    released_at?: string | null;
}

export interface ResellerCollection {
    id: string;
    reseller: string;
    customer: string;
    customer_name?: string;
    amount: string;
    method: string;
    reference?: string;
    status: 'PENDING' | 'ALLOCATED' | 'REVERSED' | string;
    created_at: string;
}

export interface ResellerCustomer {
    id: string;
    full_name: string;
    mobile: string;
    area_zone?: string;
    pppoe_username?: string;
    package_name?: string;
    status: string;
    expiry_date?: string;
}

export type PaginatedList<T> = PaginatedResponse<T> | T[];

export function asList<T>(res: PaginatedList<T> | undefined | null): T[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    return res.results ?? [];
}

export interface TenantCredentials {
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    admin_username: string;
    admin_user_id?: number;
    contact_email: string;
    default_password_hint: string;
}

export interface TenantAccountItem {
    id: string;
    user_id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    phone?: string;
    role_id?: string | null;
    role_name?: string;
    is_active: boolean;
    last_login?: string | null;
    created_at?: string | null;
}

export interface CreateTenantAccountPayload {
    username: string;
    password: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    role_id?: string;
}

export interface TenantPermissionItem {
    id: string;
    codename: string;
    name: string;
    module: string;
    description?: string;
}

export interface TenantRoleItem {
    id: string;
    name: string;
    description?: string;
    is_default?: boolean;
    members_count?: number;
    permissions: TenantPermissionItem[];
}

export interface CreateTenantRolePayload {
    name: string;
    description?: string;
    permission_ids: string[];
}

export interface AutoLoginResponse {
    token: string;
    username: string;
    tenant_slug: string;
    launch_url: string;
}

