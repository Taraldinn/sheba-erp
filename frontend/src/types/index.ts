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
  api_protocol?: 'REST' | 'API';
  https_port?: number;
  api_port?: number;
  winbox_port?: number;
  username?: string;
  password?: string;
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
}


export interface OLT {
  id: string;
  name: string;
  brand: string;
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
}

export interface ONU {
  id: string;
  olt: string;
  olt_name?: string;
  pon_port: string;
  onu_index: number;
  mac_address: string;
  serial_number: string;
  customer_name: string;
  customer_phone: string;
  rx_power: number;
  tx_power: number;
  status: 'Online' | 'Offline' | 'DyingGasp' | 'Los';
  signal_status?: 'good' | 'warning' | 'critical';
  distance_meters?: number;
  last_sync?: string;
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

