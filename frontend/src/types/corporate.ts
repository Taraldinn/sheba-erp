export type CorporateCustomerStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
export type BillingCycle = 'CALENDAR_MONTH' | 'ANNIVERSARY';
export type AggregationPolicy = 'AGGREGATE_SUM' | 'PER_CIRCUIT';
export type ConnectionType = 'LEASED_LINE' | 'METRO_ETHERNET' | 'VLAN_TRUNK' | 'PPPOE_ENTERPRISE' | 'STATIC_ROUTED';
export type ConnectionStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED';
export type IPAddressStatus = 'AVAILABLE' | 'ALLOCATED' | 'RESERVED';
export type PeriodCalculationStatus = 'OPEN' | 'CALCULATING' | 'CALCULATED' | 'INVOICED' | 'FINALIZED' | 'INSUFFICIENT_DATA';

export interface CorporateCustomer {
  id: string;
  customer: string;
  customer_code?: string;
  customer_name?: string;
  customer_mobile?: string;
  customer_due?: string;
  customer_advance?: string;
  company_name: string;
  legal_name?: string;
  trade_license_no?: string;
  bin_tin?: string;
  contact_person: string;
  billing_contact_email: string;
  billing_contact_phone: string;
  committed_bandwidth_mbps: number;
  burst_rate_per_mbps: string;
  base_monthly_fee: string;
  billing_cycle: BillingCycle;
  credit_terms_days: number;
  aggregation_policy: AggregationPolicy;
  status: CorporateCustomerStatus;
  notes?: string;
  active_circuits_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface AssignedVLANInfo {
  id: string;
  vlan_id: number;
  name: string;
  router_name: string;
  interface_name: string;
}

export interface CorporateConnection {
  id: string;
  corporate_customer: string;
  company_name?: string;
  circuit_id: string;
  name: string;
  service_location: string;
  connection_type: ConnectionType;
  router: string | null;
  router_name?: string;
  interface_name: string;
  committed_bandwidth_mbps: number;
  burst_bandwidth_cap_mbps: number;
  status: ConnectionStatus;
  activation_date?: string | null;
  termination_date?: string | null;
  metadata?: Record<string, any>;
  assigned_vlan?: AssignedVLANInfo | null;
  assigned_ips?: string[];
  created_at: string;
  updated_at?: string;
}

export interface CorporateIPPool {
  id: string;
  name: string;
  network_cidr: string;
  gateway: string;
  dns_primary: string;
  dns_secondary: string;
  total_ips: number;
  allocated_ips: number;
  available_ips: number;
  created_at: string;
  updated_at?: string;
}

export interface CorporateIPAddress {
  id: string;
  pool: string;
  pool_name?: string;
  ip_address: string;
  status: IPAddressStatus;
  connection?: string | null;
  circuit_id?: string;
  allocated_at?: string | null;
  released_at?: string | null;
  notes?: string;
}

export interface CorporateVLAN {
  id: string;
  vlan_id: number;
  name: string;
  router: string;
  router_name?: string;
  interface_name: string;
  connection?: string | null;
  circuit_id?: string;
  description?: string;
  created_at: string;
}

export interface MRTGDataPoint {
  timestamp: string;
  inbound_mbps: number;
  outbound_mbps: number;
  max_mbps: number;
  circuit_id: string;
}

export interface MRTGGraphResponse {
  total_points: number;
  hours: number;
  points: MRTGDataPoint[];
}

export interface CorporateBillingPeriod {
  id: string;
  corporate_customer: string;
  company_name?: string;
  period_start: string;
  period_end: string;
  status: PeriodCalculationStatus;
  total_samples: number;
  coverage_percent: string;
  p95_inbound_mbps: string;
  p95_outbound_mbps: string;
  p95_billable_mbps: string;
  committed_mbps: number;
  burst_mbps: string;
  burst_rate_per_mbps: string;
  base_charge: string;
  burst_charge: string;
  total_payable: string;
  invoice?: string | null;
  invoice_no?: string;
  calculation_metadata?: Record<string, any>;
  calculated_at?: string | null;
  finalized_at?: string | null;
}
