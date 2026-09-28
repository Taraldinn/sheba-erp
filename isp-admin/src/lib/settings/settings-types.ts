/**
 * SHEBAFI TENANT SETTINGS — AUTHORITATIVE TYPES
 * Exact match against Django CompanySetting & OpenAPI schema #/components/schemas/CompanySetting
 */

export type ThemeModeEnum = 'dark' | 'light' | 'system' | 'midnight' | 'cyberpunk';
export type AccentColorEnum = 'indigo' | 'emerald' | 'violet' | 'cyan' | 'amber' | 'rose';
export type SmsProviderEnum = 'Custom URL Gateway' | 'Greenweb' | 'BulkSMSBD' | 'Onnorokom' | 'Twilio';

export interface CompanySetting {
  id: number;
  tenant: string; // UUID
  updated_at: string; // ISO datetime

  // 1. Company Profile & Invoicing
  company_name: string;
  tagline: string;
  client_name: string;
  client_date_of_birth: string | null;
  payment_tutorial_video: string;
  currency_symbol: string;
  currency_code: string;
  invoice_prefix: string;
  customer_id_prefix: string;
  support_phone: string;
  support_email: string;
  website: string;
  address: string;
  tax_number: string;
  billing_footer_note: string;

  // 2. UI, Theme & Branding
  logo_url: string;
  favicon_url: string;
  theme_mode: ThemeModeEnum;
  accent_color: AccentColorEnum;
  compact_mode: boolean;
  live_traffic_interval_sec: number;

  // 3. Billing & Expiry Rules
  auto_lock_on_expiry: boolean;
  grace_period_days: number;
  promise_max_days: number;
  auto_generate_monthly_invoice: boolean;
  undo_recharge_deduct_hours: number;
  admin_expire_time: string;
  recharge_discount_enabled: boolean;
  show_reseller_profile_speed: boolean;

  // 4. SMS Gateway, Placeholders & Templates
  sms_enabled: boolean;
  sms_sender_id: string;
  sms_provider: SmsProviderEnum;
  sms_api_key: string;
  sms_gateway_url: string;
  sms_reminder_days: number;
  send_sms_on_payment: boolean;
  send_sms_on_expiry: boolean;

  welcome_sms_template: string;
  payment_sms_template: string;
  advance_loan_sms_template: string;
  reminder_27d_template: string;
  reminder_27d_time: string;
  expiry_reminder_template: string;
  expiry_reminder_time: string;

  // 5. MikroTik & Network Defaults
  mikrotik_default_port: number;
  mikrotik_timeout_sec: number;
  mikrotik_auto_kick_on_expire: boolean;
  default_dns_primary: string;
  default_dns_secondary: string;
}

export type PatchedCompanySetting = Partial<Omit<CompanySetting, 'id' | 'tenant' | 'updated_at'>>;

export interface PaymentGatewayConfig {
  id?: string;
  provider: 'BKASH' | 'NAGAD' | 'SSLCOMMERZ' | 'ROCKET' | 'UPAY';
  title: string;
  is_active: boolean;
  is_sandbox: boolean;
  merchant_number?: string;
  merchant_phone?: string;
  app_key?: string;
  app_secret?: string;
  username?: string;
  password?: string;
  sandbox_app_key?: string;
  sandbox_app_secret?: string;
  sandbox_username?: string;
  sandbox_password?: string;
  public_key?: string;
  private_key?: string;
  store_id?: string;
  store_password?: string;
  shop_payment_enabled?: boolean;
  shop_base_url?: string;
}

export interface VoiceSettingConfig {
  id?: number;
  is_enabled: boolean;
  api_bearer_token: string;
  caller_sender_id: string;
  voice_file_name: string;
  enable_expiry_reminder: boolean;
  call_when: string;
  call_time: string;
  retry_unanswered: boolean;
  max_attempts: string;
  retry_delay: string;
  safe_hours_start: string;
  safe_hours_end: string;
  account_balance?: string;
  calls_today?: number;
  answered_count?: number;
  unanswered_count?: number;
  failed_count?: number;
  rejected_count?: number;
  pending_count?: number;
}

export type SettingsTabKey =
  | 'profile'
  | 'branding'
  | 'billing'
  | 'customers'
  | 'sms'
  | 'network'
  | 'gateways'
  | 'voice';
