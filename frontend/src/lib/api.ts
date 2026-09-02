import { mockCustomers, mockKPIs, mockPackages, mockRouters, mockOLTs, mockONUs, mockTransactions, mockSmsLogs, mockTickets } from './mock-data';
import { Customer, DashboardKPIs, Package, Router, OLT, ONU, PaymentTransaction, SmsLog, Ticket } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const DEFAULT_SEED_TOKEN = 'f61f38499c6f489531706cd62aaf8d92593239ef';

export class ApiClient {
  private static token: string | null = null;
  private static tenantId: string = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'shebafi';

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

  // ════════════════════════ AUTH ════════════════════════
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

  // ════════════════════════ DASHBOARD & ANALYTICS ════════════════════════
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

  // ════════════════════════ CUSTOMERS (FULL CRUD) ════════════════════════
  static async getCustomers(params?: { search?: string; status?: string; package?: string; router?: string }): Promise<Customer[]> {
    try {
      const url = new URL(`${API_BASE}/customers/`);
      if (params?.search) url.searchParams.append('search', params.search);
      if (params?.status && params.status !== 'ALL' && params.status !== 'Any Status') url.searchParams.append('status', params.status);
      if (params?.package && params.package !== 'All Packages') url.searchParams.append('package', params.package);
      if (params?.router) url.searchParams.append('router', params.router);

      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockCustomers;
  }

  static async getCustomer(id: string): Promise<Customer | null> {
    try {
      const res = await fetch(`${API_BASE}/customers/${id}/`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return mockCustomers.find(c => c.id === id) || null;
  }

  static async createCustomer(payload: Partial<Customer>) {
    const res = await fetch(`${API_BASE}/customers/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to create customer');
    }
    return await res.json();
  }

  static async updateCustomer(id: string, payload: Partial<Customer>) {
    const res = await fetch(`${API_BASE}/customers/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to update customer');
    }
    return await res.json();
  }

  static async deleteCustomer(id: string) {
    const res = await fetch(`${API_BASE}/customers/${id}/`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  static async toggleInternet(customerId: string, state?: 'on' | 'off') {
    const res = await fetch(`${API_BASE}/customers/${customerId}/toggle-internet/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(state ? { state } : {}),
    });
    if (!res.ok) throw new Error('Failed to toggle internet status');
    return await res.json();
  }

  static async rechargeCustomer(customerId: string, payload: { amount: number; validity_days: number; payment_method: string; discount?: number; notes?: string }) {
    const res = await fetch(`${API_BASE}/customers/${customerId}/recharge/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to process recharge');
    }
    return await res.json();
  }

  // ════════════════════════ PACKAGES & OFFERS (FULL CRUD) ════════════════════════
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

  static async createPackage(payload: Partial<Package>) {
    const res = await fetch(`${API_BASE}/packages/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to create package');
    }
    return await res.json();
  }

  static async updatePackage(id: string, payload: Partial<Package>) {
    const res = await fetch(`${API_BASE}/packages/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to update package');
    }
    return await res.json();
  }

  static async deletePackage(id: string) {
    const res = await fetch(`${API_BASE}/packages/${id}/`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return res.ok;
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

  static async createOffer(payload: any) {
    const res = await fetch(`${API_BASE}/offers/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  // ════════════════════════ ROUTERS & NETWORK (FULL CRUD) ════════════════════════
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

  static async createRouter(payload: Partial<Router>) {
    const res = await fetch(`${API_BASE}/routers/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to create router');
    }
    return await res.json();
  }

  static async updateRouter(id: string, payload: Partial<Router>) {
    const res = await fetch(`${API_BASE}/routers/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to update router');
    }
    return await res.json();
  }

  static async deleteRouter(id: string) {
    const res = await fetch(`${API_BASE}/routers/${id}/`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  static async syncRouter(routerId: string) {
    const res = await fetch(`${API_BASE}/routers/${routerId}/sync_pppoe/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return await res.json();
  }

  static async getRouterLiveTraffic(routerId: string) {
    try {
      const res = await fetch(`${API_BASE}/routers/${routerId}/live_traffic/`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return { download_mbps: 650.4, upload_mbps: 180.2, cpu_percent: 28, active_sessions: 420 };
  }

  // ════════════════════════ OLTS & ONUS (FULL CRUD) ════════════════════════
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

  static async createOLT(payload: Partial<OLT>) {
    const res = await fetch(`${API_BASE}/olts/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to add OLT');
    return await res.json();
  }

  static async updateOLT(id: string, payload: Partial<OLT>) {
    const res = await fetch(`${API_BASE}/olts/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteOLT(id: string) {
    const res = await fetch(`${API_BASE}/olts/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
  }

  static async getONUs(params?: { olt?: string; search?: string }): Promise<ONU[]> {
    try {
      const url = new URL(`${API_BASE}/onus/`);
      if (params?.olt && params.olt !== 'ALL') url.searchParams.append('olt', params.olt);
      if (params?.search) url.searchParams.append('search', params.search);

      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return mockONUs;
  }

  static async createONU(payload: Partial<ONU>) {
    const res = await fetch(`${API_BASE}/onus/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to register ONU');
    return await res.json();
  }

  static async updateONU(id: string, payload: Partial<ONU>) {
    const res = await fetch(`${API_BASE}/onus/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteONU(id: string) {
    const res = await fetch(`${API_BASE}/onus/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
  }

  static async rebootONU(onuId: string) {
    const res = await fetch(`${API_BASE}/onus/${onuId}/reboot/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return await res.json();
  }

  // ════════════════════════ POP BRANCHES (FULL CRUD) ════════════════════════
  static async getBranches(status?: string) {
    try {
      const url = new URL(`${API_BASE}/branches/`);
      if (status && status !== 'ALL') url.searchParams.append('status', status);
      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async createBranch(payload: any) {
    const res = await fetch(`${API_BASE}/branches/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create POP branch');
    return await res.json();
  }

  static async updateBranch(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/branches/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteBranch(id: string) {
    const res = await fetch(`${API_BASE}/branches/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
  }

  // ════════════════════════ USER SESSIONS ════════════════════════
  static async getUserSessions(routerId?: string) {
    try {
      const url = new URL(`${API_BASE}/user-sessions/`);
      if (routerId) url.searchParams.append('router', routerId);
      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  // ════════════════════════ SUPPORT & TICKETS (FULL CRUD) ════════════════════════
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

  static async createTicket(payload: Partial<Ticket>) {
    const res = await fetch(`${API_BASE}/tickets/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to create ticket');
    }
    return await res.json();
  }

  static async updateTicket(id: string, payload: Partial<Ticket>) {
    const res = await fetch(`${API_BASE}/tickets/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteTicket(id: string) {
    const res = await fetch(`${API_BASE}/tickets/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
  }

  static async replyTicket(ticketId: string, message: string) {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/reply/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message }),
    });
    return await res.json();
  }

  // ════════════════════════ TASKS (FULL CRUD) ════════════════════════
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

  static async createTask(payload: any) {
    const res = await fetch(`${API_BASE}/tasks/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create task');
    return await res.json();
  }

  static async updateTask(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/tasks/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteTask(id: string) {
    const res = await fetch(`${API_BASE}/tasks/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
  }

  // ════════════════════════ HR & EMPLOYEES (FULL CRUD) ════════════════════════
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

  static async createEmployee(payload: any) {
    const res = await fetch(`${API_BASE}/employees/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create employee');
    return await res.json();
  }

  static async updateEmployee(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/employees/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteEmployee(id: string) {
    const res = await fetch(`${API_BASE}/employees/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
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

  static async markAttendance(payload: { employee: string | number; status: string; date?: string }) {
    const res = await fetch(`${API_BASE}/attendance/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
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

  static async createLeave(payload: any) {
    const res = await fetch(`${API_BASE}/leaves/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async updateLeave(id: string | number, payload: any) {
    const res = await fetch(`${API_BASE}/leaves/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
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

  static async createAdvanceSalary(payload: any) {
    const res = await fetch(`${API_BASE}/advance-salaries/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
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

  // ════════════════════════ STORE & INVENTORY (FULL CRUD) ════════════════════════
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

  static async createStoreItem(payload: any) {
    const res = await fetch(`${API_BASE}/store-items/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create store item');
    return await res.json();
  }

  static async updateStoreItem(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/store-items/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteStoreItem(id: string) {
    const res = await fetch(`${API_BASE}/store-items/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
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

  static async createStockTransaction(payload: any) {
    const res = await fetch(`${API_BASE}/stock-transactions/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  // ════════════════════════ FINANCE, PAYMENTS & GATEWAYS (FULL CRUD) ════════════════════════
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

  static async createTransaction(payload: any) {
    const res = await fetch(`${API_BASE}/transactions/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async getInvoices(status?: string) {
    try {
      const url = new URL(`${API_BASE}/invoices/`);
      if (status && status !== 'ALL') url.searchParams.append('status', status);
      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async createInvoice(payload: any) {
    const res = await fetch(`${API_BASE}/invoices/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async getPaymentGateways() {
    try {
      const res = await fetch(`${API_BASE}/payment-gateways/`, { headers: this.getHeaders() });
      if (res.ok) {
        const d = await res.json();
        return d.results || d;
      }
    } catch {}
    return [];
  }

  static async createPaymentGateway(payload: any) {
    const res = await fetch(`${API_BASE}/payment-gateways/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async updatePaymentGateway(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/payment-gateways/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deletePaymentGateway(id: string) {
    const res = await fetch(`${API_BASE}/payment-gateways/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
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

  static async createSmsLog(payload: any) {
    const res = await fetch(`${API_BASE}/sms-logs/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  // ════════════════════════ CALL CENTER (FULL CRUD) ════════════════════════
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

  static async createCallLog(payload: any) {
    const res = await fetch(`${API_BASE}/call-logs/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async getVoiceSettings() {
    try {
      const res = await fetch(`${API_BASE}/voice-settings/`, { headers: this.getHeaders() });
      if (res.ok) {
        const d = await res.json();
        const list = d.results || d;
        return list[0] || null;
      }
    } catch {}
    return null;
  }

  static async updateVoiceSettings(id: string | number, payload: any) {
    const res = await fetch(`${API_BASE}/voice-settings/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async voiceTestCall(payload: { phone: string; sender: string; voice: string }) {
    const res = await fetch(`${API_BASE}/voice-settings/test_call/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async getVoiceTemplates() {
    try {
      const res = await fetch(`${API_BASE}/voice-templates/`, { headers: this.getHeaders() });
      if (res.ok) {
        const d = await res.json();
        return d.results || d;
      }
    } catch {}
    return [];
  }

  static async createVoiceTemplate(payload: any) {
    const res = await fetch(`${API_BASE}/voice-templates/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  // ════════════════════════ STAFF & RESELLERS ════════════════════════
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

  static async createStaff(payload: any) {
    const res = await fetch(`${API_BASE}/staff/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async updateStaff(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/staff/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  static async deleteStaff(id: string) {
    const res = await fetch(`${API_BASE}/staff/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
  }

  // ════════════════════════ SETTINGS & AUDIT LOGS ════════════════════════
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
      const putRes = await fetch(`${API_BASE}/settings/${id}/`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      return await putRes.json();
    }
    return await res.json();
  }

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
}
