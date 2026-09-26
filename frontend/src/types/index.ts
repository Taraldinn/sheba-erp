export type CustomerStatus = 'Active' | 'Expired' | 'Suspended' | 'Left' | 'Due';

export interface Customer {
  id: string;
  customer_code: string;
  full_name: string;
  mobile: string;
  email: string;
  address: string;
  area_zone: string;
  check_in_time?: string;
  salary?: number;
  join_date?: string;

  connection_type: string;
  router: string | null;
  router_name?: string;
  router_ip?: string;
  router_protocol?: 'REST' | 'API' | 'RADIUS';
  router_status?: string;
  live_session?: {
    is_online: boolean;
    ip_address?: string;
    mac_address?: string;
    caller_id?: string;
    uptime?: string;
    bytes_in?: number;
    bytes_out?: number;
    router_name?: string;
    connected_at?: string;
    last_seen?: string;
  };
  pppoe_username: string;
  pppoe_password?: string;
  package: string | null;
  package_name?: string;
  package_speed?: number;
  billing_type: 'Prepaid' | 'Postpaid';
  monthly_bill: number;
  due_amount: number;
  advance_amount: number;
  discount: number;
  bill_date: string;
  expiry_date: string | null;
  promise_date: string | null;
  status: CustomerStatus;
  auto_lock_enabled: boolean;
  internet_active?: boolean;
  reseller?: string | null;
  reseller_name?: string;
  created_at: string;
}

export interface Package {
  id: string;
  name: string;
  mikrotik_profile: string;
  speed_mbps: number;
  upload_speed_mbps: number;
  validity_days: number;
  regular_price: number;
  min_reseller_price: number;
  description: string;
  is_active: boolean;
  subscribers_count?: number;
}

export interface EmployeeItem {
  id: string;
  code?: string;
  name?: string;
  full_name?: string;
  designation: string;
  department: string;
  phone?: string;
  mobile?: string;
  email?: string;
  basic_salary?: number;
  salary?: number;
  attendance_status?: 'Present' | 'Late' | 'Absent' | 'On Leave';
  check_in_time?: string;
  join_date?: string;
  joining_date?: string;
  status?: string;
  nid?: string;
  address?: string;
}

export interface Router {
  id: string;
  name: string;
  ip_address: string;
  hostname?: string;
  api_protocol?: 'REST' | 'API' | 'RADIUS';
  https_port?: number;
  api_port?: number;
  winbox_port?: number;
  username?: string;
  password?: string;
  radius_secret?: string;
  has_radius_secret?: boolean;
  radius_auth_port?: number;
  radius_acct_port?: number;
  radius_coa_port?: number;
  nas_identifier?: string;
  radius_script?: string;
  location?: string;
  description?: string;
  model?: string;
  active_sessions?: number;
  cpu_load?: number;
  ros_version?: string;
  routeros_version?: string;
  free_memory_mb?: number;
  uptime?: string;
  status: 'Online' | 'Offline' | 'Error';
  is_active?: boolean;
  ssl_verify?: boolean;
  connection_timeout?: number;
  retry_count?: number;

  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  active_pppoe_count?: number;
  total_customers_count?: number;
  last_ping?: string | null;

  // Expire Pool / Captive Walled Garden
  expire_pool_enabled?: boolean;
  expire_pool_name?: string;
  expire_profile_name?: string;
  expire_rate_limit?: string;
  expire_pool_network?: string;
  expire_local_address?: string;
  expire_redirect_url?: string;
  expire_walled_garden?: string;
  expire_pool_script?: string;

  // Live interface telemetry (populated by health endpoint)
  interfaces?: RouterInterface[];
}

export interface RouterInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  mac_address: string;
  mtu: number;
  rx_bytes: number;
  tx_bytes: number;
  rx_errors: number;
  tx_errors: number;
  comment: string;
}

export interface RouterExpirePoolConfig {
  router_id: string;
  router_name: string;
  expire_pool_enabled: boolean;
  expire_pool_name: string;
  expire_profile_name: string;
  expire_rate_limit: string;
  expire_pool_network: string;
  expire_local_address: string;
  expire_redirect_url?: string;
  expire_walled_garden?: string;
  script?: string;
  stats?: {
    expired_subscribers: number;
    active_subscribers: number;
    total_subscribers: number;
  };
  provision_result?: {
    success: boolean;
    pool?: any;
    profile?: any;
    walled_garden?: any;
    nat_rule?: any;
    web_proxy?: any;
    error?: string;
  };
}


export interface OLT {
  id: string;
  name: string;
  brand: string;
  access_mode?: string;
  ip_address: string;
  pon_ports_count?: number;
  total_onus?: number;
  online_onus?: number;
  status: 'Online' | 'Offline';
  last_sync?: string | null;
  model?: string;
  type?: string;
  pon_ports?: number;
  warning_onus?: number;
  upstream_router?: string | null;
  upstream_router_name?: string;
  upstream_router_ip?: string;
  upstream_router_status?: string;
}

export interface ONU {
  id: string;
  olt: string;
  olt_name?: string;
  pon_port: string;
  onu_index: number;
  mac_address: string;
  serial_number: string;
  customer?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_username?: string;
  customer_full_name?: string;
  rx_power: number;
  tx_power: number;
  temperature?: number | string | null;
  uptime?: string;
  status: 'Online' | 'Offline' | 'DyingGasp' | 'Los';
  signal_status?: 'good' | 'warning' | 'critical';
  signal_quality?: 'Good' | 'Fair' | 'Poor' | 'Offline' | 'Unknown';
  mactable?: Array<{ mac: string; vlan: string | number }>;
  distance_meters?: number;
  last_sync?: string;
}

export interface OLTMonitorPortStats {
  total: number;
  online: number;
  offline: number;
  poor?: number;
}

export interface OLTMonitorOLTSummary {
  id: string;
  name: string;
  brand: string;
  ip_address: string;
  access_mode: string;
  status: 'Online' | 'Offline';
  total: number;
  online: number;
  offline: number;
  poor: number;
  ports: Record<string, OLTMonitorPortStats>;
  last_sync?: string | null;
}

export interface OLTMonitorSummary {
  total_onus: number;
  active_onus: number;
  offline_onus: number;
  poor_signal: number;
  olt_summary: Record<string, OLTMonitorOLTSummary>;
}

export interface MACSearchResult {
  olt_id?: string;
  olt_name: string;
  olt_ip: string;
  mac: string;
  vlan: string | number;
  port: string;
  onu_id: string;
  onu_db_id?: string | null;
  customer_name?: string;
  customer_username?: string;
  rx_power?: number | null;
  status?: string;
  source?: string;
}

export interface PaymentTransaction {
  id: string;
  customer: string;
  customer_name?: string;
  customer_username?: string;
  amount: number;
  trx_id: string;
  payment_method: string;
  status: 'Pending' | 'Success' | 'Failed' | 'Matched' | 'Refunded';
  customer_account: string;
  created_at: string;
}

export interface SmsLog {
  id: string;
  sender: string;
  raw_message: string;
  parsed_provider: string;
  parsed_amount: number | null;
  parsed_trx_id: string;
  parsed_account: string;
  is_matched: boolean;
  matched_customer_name?: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_no: string;
  customer: string;
  customer_name?: string;
  customer_phone?: string;
  pppoe_username?: string;
  category: string;
  subject: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'In_Progress' | 'Resolved' | 'Closed';
  assigned_to?: string;
  assigned_to_name?: string;
  created_at: string;
  replies?: Array<{
    id: string;
    sender_name: string;
    is_staff: boolean;
    message: string;
    created_at: string;
  }>;
}

export type DashboardRole =
  | 'admin'
  | 'billing'
  | 'sales'
  | 'demo'
  | 'technician'
  | 'staff'
  | 'reseller_l1'
  | 'reseller_l2'
  | 'distributor'
  | 'bandwidth_reseller';

export interface DashboardKPIs {
  total_customers: number;
  active_customers: number;
  expired_customers: number;
  suspended_customers: number;
  today_collection: number;
  month_collection: number;
  total_due: number;
  total_advance: number;
  online_routers: number;
  total_routers: number;
  total_onus: number;
  online_onus: number;
  warning_onus: number;
  critical_onus?: number;
  open_tickets: number;
}


export interface Notification {
  id: string;
  type: 'ticket' | 'payment' | 'customer' | 'network' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  icon: string;
  action_url?: string;
  action_label?: string;
  read: boolean;
  created_at: string;
  related_id?: string;
}

export interface PermissionItem {
  id: number;
  codename: string;
  name: string;
  module: string;
}

export interface RoleItem {
  id: string;
  tenant?: string;
  name: string;
  description: string;
  is_active: boolean;
  permissions: number[];
  permissions_detail?: PermissionItem[];
  members_count?: number;
  created_at?: string;
}

export interface StaffItem {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: string;
  role_display?: string;
  role_id?: string;
  role_name?: string;
  scope: 'GLOBAL' | 'TENANT' | 'POP' | 'AREA' | 'SELF' | 'ASSIGNED';
  phone?: string;
  national_id?: string;
  address?: string;
  is_active: boolean;
  created_at?: string;
}

// ════════════════════════ PHASE 11: NETWORK OPERATIONS COCKPIT ════════════════════════

export interface NetworkCockpitDashboard {
  routers: {
    total: number;
    healthy: number;
    degraded: number;
    avg_cpu_usage: number;
    avg_memory_usage: number;
    avg_disk_usage: number;
  };
  customers: {
    total: number;
    online: number;
    offline: number;
    active: number;
    expired: number;
  };
  pending_actions: number;
  failed_actions: number;
  olt: {
    total: number;
    healthy: number;
    degraded: number;
  };
  onu: {
    total: number;
    online: number;
    offline: number;
    optical_alerts: number;
  };
  sessions: {
    total_active: number;
    bytes_in: number;
    bytes_out: number;
    total_gb: number;
  };
  recent_failures: Array<{
    id: string;
    action: string;
    status: string;
    error_message: string;
    retry_count: number;
    router_name?: string | null;
    olt_name?: string | null;
    customer_code?: string | null;
    pppoe_username?: string;
    created_at: string;
  }>;
  pop_branches: Array<{
    id: string;
    name: string;
    code: string;
    location?: string;
    total_capacity: number;
    status: string;
    customer_count: number;
  }>;
  area_breakdown: Array<{
    area_zone: string;
    total_subscribers: number;
    online_count: number;
    offline_count: number;
    expired_count: number;
  }>;
  timestamp: string;
}

export interface RouterCockpitDetail {
  router: Router & {
    effective_host?: string;
    api_protocol?: string;
  };
  customer_stats: {
    total_provisioned: number;
    online_customers: number;
    offline_customers: number;
  };
  active_sessions_count: number;
  customers: Array<{
    id: string;
    customer_code: string;
    full_name: string;
    pppoe_username: string;
    static_ip: string;
    area_zone: string;
    package_name: string;
    speed_mbps: number;
    monthly_bill: string;
    due_amount: string;
    expiry_date: string | null;
    status: string;
    is_online: boolean;
  }>;
  active_sessions: Array<{
    id: string;
    username: string;
    ip_address: string;
    mac_address: string;
    uptime: string;
    bytes_in: number;
    bytes_out: number;
    connected_at: string | null;
  }>;
  recent_jobs: Array<{
    id: string;
    action: string;
    status: string;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
}

export interface OLTCockpitDetail {
  olt: OLT & {
    brand_display?: string;
    total_onus: number;
    online_onus: number;
    offline_onus: number;
  };
  optical_distribution: {
    normal: number;
    warning: number;
    critical_or_los: number;
  };
  pon_ports: Array<{
    pon_port: string;
    total_onus: number;
    online_onus: number;
    offline_onus: number;
  }>;
  onus: Array<{
    id: string;
    pon_port: string;
    onu_index: number;
    mac_address: string;
    serial_number: string;
    customer_name: string;
    customer_code: string;
    rx_power: string;
    tx_power: string;
    distance_meters: number;
    status: string;
    last_offline_reason?: string | null;
    last_sync: string | null;
  }>;
  recent_jobs: Array<{
    id: string;
    action: string;
    status: string;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
}

export interface CustomerNetworkStatus {
  customer: {
    id: string;
    customer_code: string;
    full_name: string;
    mobile: string;
    email: string;
    area_zone: string;
    connection_type: string;
    pppoe_username: string;
    package_name: string;
    monthly_bill: string;
    due_amount: string;
    advance_amount: string;
    expiry_date: string | null;
    status: string;
  };
  session: {
    is_online: boolean;
    ip_address: string;
    mac_address: string;
    caller_id: string;
    uptime: string;
    bytes_in: number;
    bytes_out: number;
    connected_at: string | null;
    last_seen: string | null;
  };
  router: {
    id: string;
    name: string;
    ip_address: string;
    effective_host: string;
    status: string;
    api_protocol: string;
  } | null;
  onu: {
    id: string;
    olt_name: string;
    olt_ip: string;
    pon_port: string;
    onu_index: number;
    mac_address: string;
    serial_number: string;
    rx_power: string;
    tx_power: string;
    distance_meters: number;
    status: string;
    last_offline_reason?: string | null;
    last_sync: string | null;
  } | null;
  recent_jobs: Array<{
    id: string;
    action: string;
    status: string;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
}

// ════════════════════════ PHASE 12: MIKROTIK RECONCILIATION ════════════════════════

export type ReconciliationStatus =
  | 'MATCHED'
  | 'MISSING_IN_ROUTER'
  | 'UNKNOWN_IN_ERP'
  | 'PROFILE_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'ROUTER_MISMATCH'
  | 'ERROR';

export interface PPPoESecretItem {
  id: string;
  router: string;
  router_name: string;
  router_ip: string;
  customer?: string | null;
  customer_code?: string;
  customer_name?: string;
  customer_status?: string;
  customer_area?: string;
  package?: string | null;
  package_name?: string;
  username: string;
  reconciliation_status: ReconciliationStatus;
  router_profile: string;
  expected_profile: string;
  router_disabled: boolean | null;
  expected_disabled: boolean | null;
  router_comment?: string;
  router_caller_id?: string;
  router_service?: string;
  discrepancy_details: Record<string, any>;
  last_reconciled_at: string;
  last_synced_at?: string | null;
  created_at?: string;
}

export interface ReconciliationRun {
  id: string;
  router?: string | null;
  router_name?: string;
  triggered_by: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  total_evaluated: number;
  matched_count: number;
  missing_in_router_count: number;
  unknown_in_erp_count: number;
  profile_mismatch_count: number;
  status_mismatch_count: number;
  router_mismatch_count: number;
  error_count: number;
  error_message?: string;
  created_at: string;
  completed_at?: string | null;
}

export interface CustomerNetworkIdentity {
  customer: {
    id: string;
    customer_code: string;
    full_name: string;
    status: string;
    area_zone: string;
    connection_type: string;
  };
  credentials: {
    username: string;
    has_password: boolean;
    static_ip: string;
  };
  package: {
    id: string | null;
    name: string;
    speed_mbps: number;
    expected_profile: string;
  };
  router: {
    id: string | null;
    name: string;
    ip_address: string;
    status: string;
  };
  secret_item: PPPoESecretItem | null;
  live_session: {
    is_online: boolean;
    ip_address?: string;
    mac_address?: string;
    uptime?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Network Action Queue & Bulk Operations Types
// ─────────────────────────────────────────────────────────────────────────────

export type NetworkActionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCELLED';

export type NetworkActionType =
  | 'ENABLE_SERVICE'
  | 'DISABLE_SERVICE'
  | 'RECONNECT'
  | 'CHANGE_PACKAGE'
  | 'SYNC_SECRET'
  | 'SYNC_PROFILE'
  | 'SYNC_ROUTER'
  | 'RETRY_FAILED'
  | 'REBOOT_ONU';

export interface NetworkActionItem {
  id: string;
  action: NetworkActionType | string;
  action_display: string;
  status: NetworkActionStatus;
  target_type: string;
  target_id: string;
  target_name: string;
  customer_id?: string | null;
  customer_name: string;
  customer_code?: string;
  pppoe_username?: string;
  router_id?: string | null;
  router_name?: string;
  attempt_count: number;
  max_retries: number;
  last_error?: string;
  requested_state?: Record<string, any>;
  current_state?: Record<string, any>;
  sanitized_payload?: Record<string, any>;
  result?: Record<string, any>;
  idempotency_key?: string;
  actor?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export type BulkBatchStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'PREVIEWED'
  | 'QUEUED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface BulkPreviewResult {
  total_count: number;
  eligible_count: number;
  skipped_count: number;
  action_type: string;
  target_package_name?: string | null;
  eligible_targets: Array<{
    id: string;
    name: string;
    username: string;
    router_id: string;
    router_name: string;
    current_status: string;
    current_package: string;
    target_profile: string;
  }>;
  skipped_targets: Array<{
    id: string;
    name: string;
    username: string;
    reason: string;
  }>;
}

export interface BulkNetworkBatch {
  id: string;
  action_type: string;
  status: BulkBatchStatus;
  router_id?: string | null;
  router_name?: string;
  total_count: number;
  success_count: number;
  failure_count: number;
  skipped_count: number;
  filter_criteria: Record<string, any>;
  validation_summary: Record<string, any>;
  error_summary: Array<{ target: string; error: string }>;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 14: Live Sessions, Realtime Traffic, Topology & Impact Analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveSession {
  id: string;
  username: string;
  ip_address: string;
  mac_address: string;
  caller_id?: string;
  uptime: string;
  bytes_in: number;
  bytes_out: number;
  total_bytes: number;
  rx_rate_bps: number | null;
  tx_rate_bps: number | null;
  rx_rate_formatted: string;
  tx_rate_formatted: string;
  connected_at: string | null;
  last_seen: string | null;
  is_online: boolean;
  status: 'Online' | 'Offline';
  router_id: string;
  router_name: string;
  customer_id: string | null;
  customer_name: string;
  customer_code: string;
  package_name: string;
  area_zone: string;
}

export interface TelemetrySession {
  id: string;
  username: string;
  ip_address: string;
  mac_address: string;
  caller_id?: string;
  uptime: string;
  bytes_in: number;
  bytes_out: number;
  total_bytes: number;
  rx_rate_bps: number | null;
  tx_rate_bps: number | null;
  rx_rate_formatted: string;
  tx_rate_formatted: string;
  connected_at: string | null;
  last_seen: string | null;
  router_name: string;
  is_online: boolean;
}

export interface SessionHistoryItem {
  id: string;
  username: string;
  ip_address: string;
  mac_address: string;
  connected_at: string | null;
  disconnected_at: string | null;
  duration_seconds: number;
  duration_formatted: string;
  bytes_in: number;
  bytes_out: number;
  total_bytes: number;
  terminate_cause: string;
  router_name: string;
}

export interface CustomerSessionTelemetry {
  is_online: boolean;
  active_session: TelemetrySession | null;
  session_history: SessionHistoryItem[];
  aggregates: {
    total_bytes_in: number;
    total_bytes_out: number;
    total_bytes: number;
    total_duration_seconds: number;
    total_sessions_count: number;
  };
}

export interface TopologyNode {
  id: string;
  label: string;
  type: 'POP' | 'Router' | 'OLT' | 'PON-Port';
  tier: number;
  status: 'Online' | 'Offline' | 'Healthy' | 'Degraded' | 'Warning' | 'Critical';
  details: Record<string, any>;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  capacity: string;
  status: 'Healthy' | 'Degraded' | 'Down';
}

export interface NetworkTopologyGraph {
  graph: {
    nodes: TopologyNode[];
    edges: TopologyEdge[];
  };
  summary: {
    total_nodes: number;
    total_edges: number;
    pop_count: number;
    router_count: number;
    olt_count: number;
    pon_count: number;
    total_customers: number;
    online_customers: number;
  };
  timestamp: string;
}

export interface GeoFiberFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'LineString';
    coordinates: any;
  };
  properties: {
    id?: string;
    category: 'POP' | 'Router' | 'OLT' | 'Customer' | 'FiberLink';
    name?: string;
    status?: string;
    [key: string]: any;
  };
}

export interface GeoFiberMap {
  type: 'FeatureCollection';
  features: GeoFiberFeature[];
  map_center: [number, number];
  zoom: number;
  timestamp: string;
}

export interface PathImpactAnalysis {
  target_type: string;
  target_id: string;
  path_trace: string[];
  impact_summary: {
    total_subscribers_affected: number;
    online_subscribers_affected: number;
    offline_subscribers: number;
    mrr_at_risk: string;
    currency: string;
    estimated_bandwidth_loss_mbps: number;
    dependent_olts_count: number;
    dependent_pons_count: number;
    dependent_onus_count: number;
  };
  downstream_hardware: {
    olts: Array<{ id: string; name: string; brand: string; ip_address?: string }>;
    pon_ports: string[];
    onus_sample: Array<{ id: string; pon_port: string; serial_number: string; mac_address?: string }>;
  };
  package_breakdown?: Array<{
    package_name: string;
    subscribers_count: number;
    mrr_at_risk: string;
  }>;
  affected_customers_sample: Array<{
    id: string;
    customer_code: string;
    name: string;
    pppoe_username: string;
    mobile: string;
    area_zone: string;
    monthly_bill: string;
    status: string;
    is_online: boolean;
  }>;
  suggested_remediation: string[];
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: OLT / ONU Operations & Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

export interface OLTReconciliationRun {
  id: string;
  olt: string;
  olt_name: string;
  olt_brand: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  total_evaluated: number;
  matched_count: number;
  missing_in_olt_count: number;
  unknown_in_erp_count: number;
  binding_mismatch_count: number;
  optical_alarm_count: number;
  discrepancy_details: Array<{
    type: 'MATCHED' | 'MISSING_IN_OLT' | 'UNKNOWN_IN_ERP' | 'BINDING_MISMATCH' | 'OPTICAL_ALARM';
    onu_id?: string;
    serial_number?: string;
    mac_address?: string;
    pon_port?: string;
    customer_name?: string;
    message: string;
    [key: string]: any;
  }>;
  triggered_by: string;
  error_message?: string;
  created_at: string;
  completed_at?: string | null;
}

export interface ONUAutoMatchCandidate {
  onu_id: string;
  pon_port: string;
  serial_number: string;
  mac_address: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  pppoe_username: string;
  confidence: number;
  match_reason: string;
}

export interface ONUAutoMatchResult {
  olt_id: string;
  dry_run: boolean;
  total_candidates: number;
  matched_count: number;
  matches: ONUAutoMatchCandidate[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 20: Authoritative Topology & Impact Analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthoritativePonNode {
  id: string;
  name: string;
  type: 'PON';
  olt_id: string;
  pon_port: string;
  health: 'Online' | 'Warning' | 'Critical';
  total_onus: number;
  online_onus: number;
  alarm_onus: number;
  customer_count: number;
  drilldown_available: boolean;
}

export interface AuthoritativeOltNode {
  id: string;
  raw_id: string;
  name: string;
  type: 'OLT';
  brand: string;
  ip_address: string;
  status: string;
  health: 'Online' | 'Degraded' | 'Offline';
  total_onus: number;
  online_onus: number;
  customer_count: number;
  pon_count: number;
  children: AuthoritativePonNode[];
}

export interface AuthoritativePopNode {
  id: string;
  raw_id: string;
  name: string;
  code: string;
  type: 'POP';
  location: string;
  status: string;
  health: 'Online' | 'Degraded' | 'Offline';
  power_backup?: string;
  olt_count: number;
  total_onus: number;
  online_onus: number;
  customer_count: number;
  children: AuthoritativeOltNode[];
}

export interface AuthoritativeRouterNode {
  id: string;
  raw_id: string;
  name: string;
  type: 'Router' | 'RouterGroup';
  ip_address: string;
  effective_host?: string;
  status: string;
  health: 'Online' | 'Degraded' | 'Offline';
  cpu_usage: number;
  memory_usage: number;
  active_sessions: number;
  customer_count: number;
  pop_count: number;
  children: AuthoritativePopNode[];
}

export interface AuthoritativeInternetNode {
  id: string;
  name: string;
  type: 'Internet';
  status: string;
  health: 'Online';
  total_routers: number;
  total_pops: number;
  total_olts: number;
  total_customers: number;
  online_customers: number;
  children: AuthoritativeRouterNode[];
}

export interface AuthoritativeHierarchyResponse {
  authoritative_hierarchy: AuthoritativeInternetNode;
  chain: string;
  timestamp: string;
}

export interface OnuDrilldownItem {
  id: string;
  serial_number: string;
  mac_address: string;
  pon_port: string;
  status: string;
  optical_status: string;
  rx_power: string;
  health: 'Online' | 'Warning' | 'Critical' | 'Offline';
  olt_id: string;
  olt_name: string;
  customer?: {
    id: string;
    customer_code: string;
    name: string;
    pppoe_username: string;
    mobile: string;
    package_name: string;
    monthly_bill: string;
    status: string;
    is_online: boolean;
    router_name: string;
  } | null;
}

export interface TopologyDrilldownResponse {
  node_type: string;
  node_id: string;
  pon_port?: string;
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
  results: OnuDrilldownItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Complete Networking: WireGuard VPN, Router Diagnostics, OLT Terminal
// ─────────────────────────────────────────────────────────────────────────────

export interface WireGuardSubnet {
  id: string;
  vpn_config: string;
  olt?: string;
  olt_name?: string;
  subnet: string;
  label: string;
  created_at?: string;
}

export interface WireGuardConfig {
  id: string;
  router?: string;
  router_display?: string;
  wg_ip: string;
  mik_public_key: string;
  mik_private_key?: string;
  mik_private_key_set: boolean;
  vps_public_key: string;
  endpoint_ip: string;
  endpoint_port: number;
  allowed_ips: string;
  snmp_community: string;
  router_name: string;
  router_location: string;
  last_tested_at?: string | null;
  is_reachable: boolean;
  subnets?: WireGuardSubnet[];
}

export interface RouterPingResult {
  success?: boolean;
  target: string;
  sent?: number;
  packets_sent?: number;
  received?: number;
  packets_received?: number;
  packet_loss_percent?: number;
  packet_loss_pct?: number;
  avg_ms?: number | null;
  avg_rtt_ms?: number;
  min_ms?: number | null;
  min_rtt_ms?: number;
  max_ms?: number | null;
  max_rtt_ms?: number;
  results?: any[];
  raw?: any[];
  error?: string;
}

export interface RouterTracerouteResult {
  success?: boolean;
  target: string;
  hops: Array<{
    hop: number;
    address: string;
    loss?: string;
    rtt?: string;
  }>;
  raw?: any[];
  error?: string;
}

export interface UnregisteredSecret {
  username?: string;
  name?: string;
  password?: string;
  profile: string;
  disabled: boolean;
  comment?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 21: Advanced Health & Datewise Archive types
// ─────────────────────────────────────────────────────────────────────────────

export interface AdvancedHealthInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  mac_address: string;
  mtu: number;
  rx_bytes: number;
  tx_bytes: number;
  rx_errors: number;
  tx_errors: number;
  rx_drop: number;
  tx_drop: number;
  link_downs: number;
  rx_rate_bps: number;
  tx_rate_bps: number;
  last_link_up_time: string;
  last_link_down_time: string;
  comment: string;
}

export interface AdvancedHealthArpEntry {
  address: string;
  mac_address: string;
  interface: string;
  dynamic: boolean;
  complete: boolean;
  published: boolean;
  comment: string;
}

export interface AdvancedHealthNeighborEntry {
  address: string;
  mac_address: string;
  identity: string;
  platform: string;
  board: string;
  version: string;
  interface: string;
  uptime: string;
  last_seen: string;
}

export interface AdvancedHealthRouteEntry {
  dst_address: string;
  gateway: string;
  interface: string;
  distance: number;
  scope: number;
  target_scope: number;
  active: boolean;
  static: boolean;
  dynamic: boolean;
  comment: string;
}

export interface AdvancedHealthLogEntry {
  time: string;
  topics: string;
  message: string;
}

export interface RouterAdvancedHealth {
  router_id: string;
  router_name: string;
  captured_at: string;
  interfaces: AdvancedHealthInterface[];
  arp: AdvancedHealthArpEntry[];
  neighbors: AdvancedHealthNeighborEntry[];
  routes: AdvancedHealthRouteEntry[];
  log_tail: AdvancedHealthLogEntry[];
}

export interface AdvancedHealthPingRequest {
  target: string;
  count?: number;
  timeout?: number | null;
}

export interface AdvancedHealthPingResult {
  id: string;
  router: string;
  router_name: string;
  target: string;
  packet_count: number;
  received: number;
  min_latency_ms: number | null;
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
  status: 'SUCCESS' | 'TIMEOUT' | 'UNREACHABLE' | 'ERROR';
  raw_output: unknown[];
  ran_by: string;
  ran_at: string;
}

export type ArchiveKind = 'sessions' | 'actions' | 'interfaces' | 'pings';

export interface ArchiveQueryParams {
  type?: ArchiveKind;
  date_from?: string;
  date_to?: string;
  date?: string;
  router_id?: string;
  username?: string;
  limit?: number;
  offset?: number;
}

export interface ArchiveRow {
  kind: ArchiveKind | 'session' | 'action' | 'interface_snapshot' | 'ping';
  id: string;
  occurred_at: string | null;
  router_id: string;
  router_name: string;
  username?: string;
  ip_address?: string;
  mac_address?: string;
  caller_id?: string;
  connected_at?: string | null;
  duration_seconds?: number;
  bytes_in?: number;
  bytes_out?: number;
  terminate_cause?: string;
  action?: string;
  status?: string;
  actor?: string;
  target_type?: string;
  target_id?: string;
  target_name?: string;
  error_message?: string;
  target?: string;
  packet_count?: number;
  received?: number;
  min_latency_ms?: number | null;
  avg_latency_ms?: number | null;
  max_latency_ms?: number | null;
  ran_by?: string;
  snapshot_date?: string | null;
  interfaces?: AdvancedHealthInterface[];
}

export interface ArchiveQueryResponse {
  type: ArchiveKind;
  count: number;
  limit: number;
  offset: number;
  date_from: string;
  date_to: string;
  results: ArchiveRow[];
}

export type ArchiveExportFormat = 'csv' | 'json';

export interface ArchiveExportParams extends ArchiveQueryParams {
  export_format?: ArchiveExportFormat;
}

export * from './corporate';


