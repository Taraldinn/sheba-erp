import { TokenStorage } from '@/lib/auth/token-storage';
import {
  CompanySetting,
  PatchedCompanySetting,
  PaymentGatewayConfig,
  VoiceSettingConfig,
} from './settings-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export interface ValidationErrorMap {
  [field: string]: string;
}

export class SettingsClient {
  private static cachedSettings: CompanySetting | null = null;
  private static cachedTenantId: string | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_TTL_MS = 60 * 1000; // 1 minute local TTL

  private static getHeaders(): Record<string, string> {
    const token = TokenStorage.getStoredToken();
    const activeTenant = TokenStorage.getStoredTenantId();
    const apiKey = typeof window !== 'undefined' && typeof localStorage !== 'undefined'
      ? localStorage.getItem('sheba_api_key')
      : process.env.NEXT_PUBLIC_SHEBA_API_KEY;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    if (token) {
      headers['Authorization'] = `Token ${token}`;
    }
    // Tenant scoping: strictly bound to the active tenant domain context
    if (activeTenant) {
      headers['X-Tenant-ID'] = activeTenant;
    }
    return headers;
  }

  /**
   * Explicit cache invalidation trigger
   */
  static invalidateSettingsCache(): void {
    this.cachedSettings = null;
    this.cachedTenantId = null;
    this.cacheTimestamp = 0;
  }

  /**
   * GET /api/v1/settings/
   * Scoped to the current tenant domain context.
   */
  static async getSettings(forceRefresh = false): Promise<CompanySetting | null> {
    const activeTenant = TokenStorage.getStoredTenantId();
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedSettings &&
      this.cachedTenantId === activeTenant &&
      now - this.cacheTimestamp < this.CACHE_TTL_MS
    ) {
      return this.cachedSettings;
    }

    const res = await fetch(`${API_BASE}/settings/`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sheba:unauthorized'));
      }
      throw new Error('Your session has expired. Please log in again.');
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to retrieve settings (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json();
    const list: CompanySetting[] = Array.isArray(data) ? data : (data.results || []);

    if (list.length > 0) {
      this.cachedSettings = list[0];
      this.cachedTenantId = activeTenant;
      this.cacheTimestamp = now;
      return list[0];
    }

    // If tenant does not have a CompanySetting row yet, auto-provision default row
    return await this.createDefaultSettings();
  }

  /**
   * POST /api/v1/settings/
   */
  static async createDefaultSettings(initial?: Partial<CompanySetting>): Promise<CompanySetting> {
    const defaultPayload: Partial<CompanySetting> = {
      company_name: 'ISP Broadband',
      tagline: 'Ultra Fast Optical Fiber Broadband',
      client_name: 'Owner',
      currency_symbol: '৳',
      currency_code: 'BDT',
      invoice_prefix: 'SHB-INV-',
      customer_id_prefix: 'SHB-',
      support_phone: '+880 1234-567890',
      support_email: 'support@isp.com',
      website: 'https://shebafi.net',
      address: 'Corporate Headquarters',
      tax_number: 'BIN-123456789',
      billing_footer_note: 'Thank you for choosing our service.',
      theme_mode: 'dark',
      accent_color: 'indigo',
      compact_mode: false,
      live_traffic_interval_sec: 2,
      auto_lock_on_expiry: true,
      grace_period_days: 2,
      promise_max_days: 5,
      auto_generate_monthly_invoice: true,
      undo_recharge_deduct_hours: 2,
      admin_expire_time: '23:59',
      recharge_discount_enabled: true,
      show_reseller_profile_speed: true,
      sms_enabled: true,
      sms_sender_id: 'SHEBAFI',
      sms_provider: 'Custom URL Gateway',
      sms_api_key: '',
      sms_gateway_url: 'https://api.provider.com/send?key={KEY}&sender={SENDER}&msg={MSG}&to={NUMBER}',
      sms_reminder_days: 3,
      send_sms_on_payment: true,
      send_sms_on_expiry: true,
      welcome_sms_template: 'Welcome [NAME]! Your [ID] is active. Password: [PASS].',
      payment_sms_template: 'Dear [NAME], we have received [AMOUNT]৳ for ID [ID].',
      advance_loan_sms_template: 'Dear [NAME], [DAYS] days credit added to ID [ID].',
      reminder_27d_template: 'Dear [NAME], your bill ID [ID] is due in 3 days.',
      reminder_27d_time: '12:00 AM',
      expiry_reminder_template: 'Dear [NAME], your service ID [ID] expires today.',
      expiry_reminder_time: '12:00 AM',
      mikrotik_default_port: 8728,
      mikrotik_timeout_sec: 5,
      mikrotik_auto_kick_on_expire: true,
      default_dns_primary: '8.8.8.8',
      default_dns_secondary: '1.1.1.1',
      ...initial,
    };

    const res = await fetch(`${API_BASE}/settings/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(defaultPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to initialize settings: ${errText}`);
    }

    const created: CompanySetting = await res.json();
    this.cachedSettings = created;
    this.cachedTenantId = TokenStorage.getStoredTenantId();
    this.cacheTimestamp = Date.now();
    return created;
  }

  /**
   * PATCH /api/v1/settings/{id}/
   * With fallback to PUT if needed.
   */
  static async updateSettings(
    id: number | string,
    patch: PatchedCompanySetting
  ): Promise<CompanySetting> {
    const res = await fetch(`${API_BASE}/settings/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(patch),
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sheba:unauthorized'));
      }
      throw new Error('Your session has expired. Please log in again.');
    }

    if (!res.ok) {
      // If PATCH is not allowed (HTTP 405), fallback to PUT with current cache merged
      const activeTenant = TokenStorage.getStoredTenantId();
      if (res.status === 405 && this.cachedSettings && this.cachedTenantId === activeTenant) {
        const fullPayload = { ...this.cachedSettings, ...patch };
        const putRes = await fetch(`${API_BASE}/settings/${id}/`, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify(fullPayload),
        });
        if (!putRes.ok) {
          const errData = await putRes.json().catch(() => ({}));
          throw new Error(this.extractError(errData) || 'Failed to update settings');
        }
        const updatedPut: CompanySetting = await putRes.json();
        this.cachedSettings = updatedPut;
        this.cachedTenantId = activeTenant;
        this.cacheTimestamp = Date.now();
        return updatedPut;
      }

      const errData = await res.json().catch(() => ({}));
      throw new Error(this.extractError(errData) || `Failed to update settings (HTTP ${res.status})`);
    }

    const updated: CompanySetting = await res.json();
    this.cachedSettings = updated;
    this.cachedTenantId = TokenStorage.getStoredTenantId();
    this.cacheTimestamp = Date.now();
    return updated;
  }

  /**
   * PATCH /api/v1/settings/current/
   * Direct tenant context settings update.
   */
  static async updateCurrentSettings(
    patch: Partial<CompanySetting>
  ): Promise<CompanySetting> {
    const res = await fetch(`${API_BASE}/settings/current/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(patch),
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sheba:unauthorized'));
      }
      throw new Error('Your session has expired. Please log in again.');
    }

    if (!res.ok) {
      const activeTenant = TokenStorage.getStoredTenantId();
      if (this.cachedSettings?.id && this.cachedTenantId === activeTenant) {
        return await this.updateSettings(this.cachedSettings.id, patch);
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(this.extractError(errData) || 'Failed to update settings');
    }

    const updated: CompanySetting = await res.json();
    this.cachedSettings = updated;
    this.cachedTenantId = TokenStorage.getStoredTenantId();
    this.cacheTimestamp = Date.now();
    return updated;
  }

  /**
   * POST /api/v1/settings/test-sms/
   */
  static async testSmsGateway(
    config: {
      sms_provider?: string;
      sms_sender_id?: string;
      sms_api_key?: string;
      sms_gateway_url?: string;
    },
    phone: string,
    message: string
  ): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/settings/test-sms/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...config,
        phone,
        message,
      }),
    });

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sheba:unauthorized'));
      }
      throw new Error('Your session has expired. Please log in again.');
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(this.extractError(errData) || `SMS Dispatch Failed (HTTP ${res.status})`);
    }

    return await res.json();
  }

  // ════════════════════════ VALIDATION ════════════════════════
  static validate(data: Partial<CompanySetting>): ValidationErrorMap {
    const errors: ValidationErrorMap = {};

    if (data.company_name !== undefined && !data.company_name.trim()) {
      errors.company_name = 'Company Name cannot be blank.';
    }
    if (data.company_name && data.company_name.length > 200) {
      errors.company_name = 'Company Name cannot exceed 200 characters.';
    }
    if (data.support_email && data.support_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.support_email.trim())) {
        errors.support_email = 'Please provide a valid support email address.';
      }
    }
    if (data.currency_symbol && data.currency_symbol.length > 10) {
      errors.currency_symbol = 'Currency symbol cannot exceed 10 characters.';
    }
    if (data.currency_code && data.currency_code.length > 10) {
      errors.currency_code = 'Currency code cannot exceed 10 characters.';
    }
    if (data.default_dns_primary && data.default_dns_primary.trim()) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(data.default_dns_primary.trim())) {
        errors.default_dns_primary = 'Primary DNS must be a valid IPv4 address (e.g. 8.8.8.8).';
      }
    }
    if (data.default_dns_secondary && data.default_dns_secondary.trim()) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(data.default_dns_secondary.trim())) {
        errors.default_dns_secondary = 'Secondary DNS must be a valid IPv4 address (e.g. 1.1.1.1).';
      }
    }
    if (data.mikrotik_default_port !== undefined && (data.mikrotik_default_port < 1 || data.mikrotik_default_port > 65535)) {
      errors.mikrotik_default_port = 'MikroTik port must be between 1 and 65535.';
    }

    return errors;
  }

  // ════════════════════════ PAYMENT GATEWAYS ════════════════════════
  static async getPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    try {
      const res = await fetch(`${API_BASE}/payment-gateways/`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.results || []);
      }
    } catch {
      // Ignore network failure and return empty list
    }
    return [];
  }

  static async createPaymentGateway(payload: Partial<PaymentGatewayConfig>): Promise<PaymentGatewayConfig> {
    const res = await fetch(`${API_BASE}/payment-gateways/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(this.extractError(err) || 'Failed to configure payment gateway');
    }
    return await res.json();
  }

  static async updatePaymentGateway(
    id: string,
    payload: Partial<PaymentGatewayConfig>
  ): Promise<PaymentGatewayConfig> {
    const res = await fetch(`${API_BASE}/payment-gateways/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(this.extractError(err) || 'Failed to update payment gateway');
    }
    return await res.json();
  }

  // ════════════════════════ VOICE SETTINGS ════════════════════════
  static async getVoiceSettings(): Promise<VoiceSettingConfig | null> {
    try {
      const res = await fetch(`${API_BASE}/voice-settings/`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.results || []);
        const item = list[0] || null;
        if (item) {
          return {
            ...item,
            call_time: item.call_time ?? null,
            safe_hours_start: item.safe_hours_start ?? null,
            safe_hours_end: item.safe_hours_end ?? null,
          };
        }
        return null;
      }
    } catch {
      // Ignore network failure
    }
    return null;
  }

  static async updateVoiceSettings(
    id: number,
    payload: Partial<VoiceSettingConfig>
  ): Promise<VoiceSettingConfig> {
    const res = await fetch(`${API_BASE}/voice-settings/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(this.extractError(err) || 'Failed to update voice reminder settings');
    }
    return await res.json();
  }

  private static extractError(data: unknown): string {
    if (!data || typeof data !== 'object') return '';
    const rec = data as Record<string, unknown>;
    if (typeof rec.detail === 'string') return rec.detail;
    if (typeof rec.error === 'string') return rec.error;
    const firstKey = Object.keys(rec)[0];
    if (firstKey) {
      const val = rec[firstKey];
      if (Array.isArray(val) && val.length > 0) return `${firstKey}: ${val[0]}`;
      if (typeof val === 'string') return `${firstKey}: ${val}`;
    }
    return '';
  }
}
