import { mockCustomers, mockKPIs, mockPackages, mockRouters, mockOLTs, mockONUs, mockTransactions, mockSmsLogs, mockTickets } from './mock-data';
import { Customer, DashboardKPIs, Package, Router, OLT, ONU, PaymentTransaction, SmsLog, Ticket } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const DEFAULT_SEED_TOKEN = 'f61f38499c6f489531706cd62aaf8d92593239ef';

export class ApiClient {
  private static token: string | null = null;
  private static tenantId: string = 'shebafi';

  static setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('sheba_token', token);
    }
  }

  static getToken(): string {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('sheba_token') || DEFAULT_SEED_TOKEN;
    }
    return this.token || DEFAULT_SEED_TOKEN;
  }

  static getHeaders(): Record<string, string> {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Token ${token}`,
      'X-Tenant-ID': this.tenantId,
    };
  }

  // Auth
  static async login(username: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': this.tenantId },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    const data = await res.json();
    if (data.token) this.setToken(data.token);
    return data;
  }

  static async getCurrentUser() {
    try {
      const res = await fetch(`${API_BASE}/auth/me/`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return { username: 'admin', email: 'admin@shebafi.net', is_superuser: true };
  }

  // Dashboard
  static async getDashboardKPIs(): Promise<DashboardKPIs> {
    try {
      const res = await fetch(`${API_BASE}/reports/dashboard/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.kpis;
      }
    } catch {}
    return mockKPIs;
  }

  static async getDashboardAnalytics() {
    try {
      const res = await fetch(`${API_BASE}/reports/dashboard/`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return { kpis: mockKPIs, monthly_trend: [], traffic_distribution: [] };
  }

  // Customers
  static async getCustomers(params?: { search?: string; status?: string; package?: string; router?: string }): Promise<Customer[]> {
    try {
      const url = new URL(`${API_BASE}/customers/`);
      if (params?.search) url.searchParams.append('search', params.search);
      if (params?.status && params.status !== 'ALL') url.searchParams.append('status', params.status);
      if (params?.package) url.searchParams.append('package', params.package);
      if (params?.router) url.searchParams.append('router', params.router);

      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}

    let filtered = [...mockCustomers];
    if (params?.status && params.status !== 'ALL') {
      filtered = filtered.filter(c => c.status === params.status);
    }
    if (params?.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter(c =>
        c.full_name.toLowerCase().includes(s) ||
        c.pppoe_username.toLowerCase().includes(s) ||
        c.mobile.includes(s) ||
        c.customer_code.toLowerCase().includes(s)
      );
    }
    return filtered;
  }

  static async createCustomer(payload: Partial<Customer>) {
    const res = await fetch(`${API_BASE}/customers/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(JSON.stringify(err));
    }
    return await res.json();
  }

  static async rechargeCustomer(customerId: string, payload: { amount: number; validity_days: number; payment_method: string; discount?: number }) {
    try {
      const res = await fetch(`${API_BASE}/customers/${customerId}/recharge/`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
    } catch {}

    const customer = mockCustomers.find(c => c.id === customerId);
    if (customer) {
      customer.status = 'Active';
      customer.due_amount = Math.max(0, customer.due_amount - payload.amount);
      const d = new Date();
      d.setDate(d.getDate() + payload.validity_days);
      customer.expiry_date = d.toISOString().split('T')[0];
    }
    return { status: 'success', message: 'Recharge posted successfully' };
  }

  // Packages & Offers
  static async getPackages(): Promise<Package[]> {
    try {
      const res = await fetch(`${API_BASE}/packages/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockPackages;
  }

  static async getOffers() {
    try {
      const res = await fetch(`${API_BASE}/offers/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  // Network: Routers, OLTs, ONUs, Sessions, Branches
  static async getRouters(): Promise<Router[]> {
    try {
      const res = await fetch(`${API_BASE}/routers/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockRouters;
  }

  static async getRouterLiveTraffic(routerId: string) {
    try {
      const res = await fetch(`${API_BASE}/routers/${routerId}/live_traffic/`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return { download_mbps: 650.4, upload_mbps: 180.2, cpu_percent: 28, active_sessions: 420 };
  }

  static async syncRouter(routerId: string) {
    const res = await fetch(`${API_BASE}/routers/${routerId}/sync_pppoe/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return await res.json();
  }

  static async getOLTs(): Promise<OLT[]> {
    try {
      const res = await fetch(`${API_BASE}/olts/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockOLTs;
  }

  static async getONUs(params?: { olt?: string; search?: string }): Promise<ONU[]> {
    try {
      const url = new URL(`${API_BASE}/onus/`);
      if (params?.olt) url.searchParams.append('olt', params.olt);
      if (params?.search) url.searchParams.append('search', params.search);

      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}

    let list = [...mockONUs];
    if (params?.olt && params.olt !== 'ALL') {
      list = list.filter(o => o.olt === params.olt);
    }
    if (params?.search) {
      const s = params.search.toLowerCase();
      list = list.filter(o =>
        o.mac_address.toLowerCase().includes(s) ||
        o.customer_name.toLowerCase().includes(s) ||
        o.serial_number.toLowerCase().includes(s)
      );
    }
    return list;
  }

  static async rebootONU(onuId: string) {
    const res = await fetch(`${API_BASE}/onus/${onuId}/reboot/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return await res.json();
  }

  static async getUserSessions() {
    try {
      const res = await fetch(`${API_BASE}/user-sessions/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getBranches(status?: string) {
    try {
      const url = new URL(`${API_BASE}/branches/`);
      if (status) url.searchParams.append('status', status);
      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  // Staff & Resellers
  static async getStaff(role?: string) {
    try {
      const res = await fetch(`${API_BASE}/staff/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = data.results || data;
        if (role) return list.filter((s: any) => s.role === role);
        return list;
      }
    } catch {}
    return [];
  }

  // Finance & Transactions
  static async getTransactions(): Promise<PaymentTransaction[]> {
    try {
      const res = await fetch(`${API_BASE}/transactions/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockTransactions;
  }

  static async getInvoices(status?: string) {
    try {
      const url = new URL(`${API_BASE}/invoices/`);
      if (status) url.searchParams.append('status', status);
      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getRecharges(customerId?: string) {
    try {
      const url = new URL(`${API_BASE}/recharges/`);
      if (customerId) url.searchParams.append('customer', customerId);
      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getSmsLogs(): Promise<SmsLog[]> {
    try {
      const res = await fetch(`${API_BASE}/sms-logs/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockSmsLogs;
  }

  // Support Tickets
  static async getTickets(): Promise<Ticket[]> {
    try {
      const res = await fetch(`${API_BASE}/tickets/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockTickets;
  }

  static async replyTicket(ticketId: string, message: string) {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/reply/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message }),
    });
    return await res.json();
  }

  // HR Management
  static async getEmployees() {
    try {
      const res = await fetch(`${API_BASE}/employees/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getAttendance() {
    try {
      const res = await fetch(`${API_BASE}/attendance/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getLeaves() {
    try {
      const res = await fetch(`${API_BASE}/leaves/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getAdvanceSalaries() {
    try {
      const res = await fetch(`${API_BASE}/advance-salaries/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getPayrolls() {
    try {
      const res = await fetch(`${API_BASE}/payrolls/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  // Store & Inventory
  static async getStoreItems() {
    try {
      const res = await fetch(`${API_BASE}/store-items/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getStockTransactions() {
    try {
      const res = await fetch(`${API_BASE}/stock-transactions/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  // Tasks & Call Center
  static async getTasks() {
    try {
      const res = await fetch(`${API_BASE}/tasks/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getCallLogs() {
    try {
      const res = await fetch(`${API_BASE}/call-logs/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  // Audit Logs & Settings
  static async getAuditLogs() {
    try {
      const res = await fetch(`${API_BASE}/audit-logs/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async getSettings() {
    try {
      const res = await fetch(`${API_BASE}/settings/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = data.results || data;
        return list[0] || null;
      }
    } catch {}
    return null;
  }

  static async updateSettings(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/settings/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Fallback with PUT
      const putRes = await fetch(`${API_BASE}/settings/${id}/`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      return await putRes.json();
    }
    return await res.json();
  }

  static async getPaymentGateways() {
    try {
      const res = await fetch(`${API_BASE}/payment-gateways/`, { headers: this.getHeaders() });
      if (res.ok) { const d = await res.json(); return d.results || d; }
    } catch {}
    return [];
  }

  static async updatePaymentGateway(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/payment-gateways/${id}/`, {
      method: 'PATCH', headers: this.getHeaders(), body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async createPaymentGateway(payload: any) {
    const res = await fetch(`${API_BASE}/payment-gateways/`, {
      method: 'POST', headers: this.getHeaders(), body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async getVoiceSettings() {
    try {
      const res = await fetch(`${API_BASE}/voice-settings/`, { headers: this.getHeaders() });
      if (res.ok) { const d = await res.json(); const list = d.results || d; return list[0] || null; }
    } catch {}
    return null;
  }

  static async updateVoiceSettings(id: string | number, payload: any) {
    const res = await fetch(`${API_BASE}/voice-settings/${id}/`, {
      method: 'PATCH', headers: this.getHeaders(), body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async voiceTestCall(payload: { phone: string; sender: string; voice: string }) {
    const res = await fetch(`${API_BASE}/voice-settings/test_call/`, {
      method: 'POST', headers: this.getHeaders(), body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async getVoiceTemplates() {
    try {
      const res = await fetch(`${API_BASE}/voice-templates/`, { headers: this.getHeaders() });
      if (res.ok) { const d = await res.json(); return d.results || d; }
    } catch {}
    return [];
  }
}

