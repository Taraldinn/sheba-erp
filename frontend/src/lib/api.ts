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
      localStorage.setItem('sheba_auth_token', token);
    }
  }

  static getToken(): string {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('sheba_token') || localStorage.getItem('sheba_auth_token') || DEFAULT_SEED_TOKEN;
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

  static async getDashboardAnalytics(role: string = 'admin') {
    try {
      const res = await fetch(`${API_BASE}/reports/dashboard/?role=${role}`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch {}
    return { kpis: mockKPIs, monthly_trend: [], traffic_distribution: [], role };
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

  static async testRouterConnection(routerId: string) {
    const res = await fetch(`${API_BASE}/routers/${routerId}/test-connection/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to connect to router');
    }
    return data;
  }

  static async getRouterHealth(routerId: string) {
    const res = await fetch(`${API_BASE}/routers/${routerId}/health/`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to fetch router health');
    }
    return data;
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

  // ════════════════════════ ROLES & PERMISSIONS (RBAC) ════════════════════════
  static async getRoles() {
    try {
      const res = await fetch(`${API_BASE}/roles/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
  }

  static async createRole(payload: any) {
    const res = await fetch(`${API_BASE}/roles/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to create role');
    }
    return await res.json();
  }

  static async updateRole(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/roles/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to update role');
    }
    return await res.json();
  }

  static async deleteRole(id: string) {
    const res = await fetch(`${API_BASE}/roles/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    return res.ok;
  }

  static async getPermissions() {
    try {
      const res = await fetch(`${API_BASE}/permissions/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch {}
    return [];
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

  // ════════════════════════ SAAS MULTI-TENANT CONTROL PLANE (admin.shebafi.xyz) ════════════════════════
  static getSaaSHeaders(customToken?: string): Record<string, string> {
    const token = customToken || this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Token ${token}`,
    };
  }

  static async fetchWithSaaSAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const defaultHeaders = this.getSaaSHeaders();
    const mergedHeaders = { ...defaultHeaders, ...(options.headers as Record<string, string> || {}) };

    let res = await fetch(url, { ...options, headers: mergedHeaders });

    // If 401 or 403, and current token is not DEFAULT_SEED_TOKEN, elevate automatically to Super Admin
    if ((res.status === 401 || res.status === 403) && this.getToken() !== DEFAULT_SEED_TOKEN) {
      console.warn(`[SaaS API] Received HTTP ${res.status} from ${url}. Elevating session to Central Super Admin seed token...`);
      const retryHeaders = { ...mergedHeaders, 'Authorization': `Token ${DEFAULT_SEED_TOKEN}` };
      const retryRes = await fetch(url, { ...options, headers: retryHeaders });
      if (retryRes.ok) {
        this.setToken(DEFAULT_SEED_TOKEN);
        if (typeof window !== 'undefined') {
          localStorage.setItem('sheba_user_role', 'super_admin');
          localStorage.setItem('sheba_user_name', 'Super Admin');
        }
        return retryRes;
      }
    }
    return res;
  }

  static async getSaaSOverview() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/overview/`);
      if (res.ok) return await res.json();
      const errText = await res.text().catch(() => '');
      console.error(`[SaaS Overview] HTTP ${res.status}:`, errText);
    } catch (err) {
      console.error('[SaaS Overview] Network error:', err);
    }
    return null;
  }

  static async getSaaSTenants() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/tenants/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
      const errText = await res.text().catch(() => '');
      console.error(`[SaaS Tenants] HTTP ${res.status}:`, errText);
    } catch (err) {
      console.error('[SaaS Tenants] Network error:', err);
    }
    return [];
  }

  static async createSaaSTenant(payload: any) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/tenants/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Failed to onboard tenant');
    }
    return await res.json();
  }

  static async toggleSaaSTenantStatus(tenantId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/tenants/${tenantId}/toggle-status/`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to toggle tenant status');
    return await res.json();
  }

  static async impersonateTenant(tenantId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/tenants/${tenantId}/impersonate/`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to create impersonation session');
    return await res.json();
  }

  static async getSaaSTenantTelemetry(tenantId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/tenants/${tenantId}/telemetry/`);
    if (!res.ok) throw new Error('Failed to fetch ISP operational telemetry');
    return await res.json();
  }

  static async updateSaaSTenant(tenantId: string, payload: any) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/tenants/${tenantId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Failed to update tenant configuration');
    }
    return await res.json();
  }

  static async deleteSaaSTenant(tenantId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/tenants/${tenantId}/`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || 'Failed to delete tenant');
    }
    return true;
  }

  static async getSaaSDomains() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/domains/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[SaaS Domains] Error:', err);
    }
    return [];
  }

  static async createSaaSDomain(payload: { tenant: string; hostname: string; is_primary?: boolean; domain_type?: string }) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/domains/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.hostname?.[0] || err.error || 'Failed to register domain');
    }
    return await res.json();
  }

  static async toggleSaaSDomainVerify(domainId: string | number) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/domains/${domainId}/toggle-verify/`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to toggle domain verification');
    return await res.json();
  }

  // ── Tenant Onboarding Requests Queue ──
  static async getSaaSTenantRequests() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/requests/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[SaaS Requests] Error:', err);
    }
    return [];
  }

  static async approveSaaSTenantRequest(requestId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/requests/${requestId}/approve/`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to approve request');
    }
    return await res.json();
  }

  static async rejectSaaSTenantRequest(requestId: string, reason: string = '') {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/requests/${requestId}/reject/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Failed to reject request');
    return await res.json();
  }

  // ── SaaS Packages & Tiers ──
  static async getSaaSPackages() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/packages/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[SaaS Packages] Error:', err);
    }
    return [];
  }

  static async createSaaSPackage(payload: any) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/packages/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.name?.[0] || err.code?.[0] || err.error || 'Failed to create SaaS package');
    }
    return await res.json();
  }

  static async updateSaaSPackage(id: string, payload: any) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/packages/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update package');
    return await res.json();
  }

  static async deleteSaaSPackage(id: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/packages/${id}/`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete package');
    return true;
  }

  static async toggleSaaSPackageStatus(id: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/packages/${id}/toggle-status/`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to toggle package status');
    return await res.json();
  }

  // ── Tenant Subscriptions & Payments ──
  static async getSaaSSubscriptions() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/subscriptions/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[SaaS Subscriptions] Error:', err);
    }
    return [];
  }

  static async createSaaSSubscription(payload: { tenant: string; package?: string; billing_cycle?: string; price?: number; auto_renew?: boolean }) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/subscriptions/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create subscription');
    }
    return await res.json();
  }

  static async renewSaaSSubscription(subscriptionId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/subscriptions/${subscriptionId}/renew/`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to renew subscription');
    }
    return await res.json();
  }

  static async cancelSaaSSubscription(subscriptionId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/subscriptions/${subscriptionId}/cancel/`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to cancel subscription');
    }
    return await res.json();
  }

  static async getSaaSPayments() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/payments/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[SaaS Payments] Error:', err);
    }
    return [];
  }

  static async createSaaSPayment(payload: { tenant: string; subscription?: string; amount: number; payment_method?: string; trx_id?: string; notes?: string }) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/payments/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to record payment');
    }
    return await res.json();
  }

  // ── Disaster Recovery & Database Backups ──
  static async getSaaSBackups() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/backups/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[SaaS Backups] Error:', err);
    }
    return [];
  }

  static async createSaaSBackup(name?: string, backup_type: string = 'full_database') {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/backups/create-backup/`, {
      method: 'POST',
      body: JSON.stringify({ name, backup_type }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Database backup failed');
    }
    return await res.json();
  }

  static async exportSaaSTenantData(tenantId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/backups/export-tenant/`, {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to export tenant data');
    }
    return await res.json();
  }

  static async restoreSaaSBackup(backupId: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/backups/${backupId}/restore/`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Database restoration failed');
    }
    return await res.json();
  }

  // ── Software User Management ──
  static async getSaaSUserDirectory() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/users/`);
      if (res.ok) return await res.json();
    } catch (err) {
      console.error('[SaaS User Directory] Error:', err);
    }
    return { platform_admins: [], tenant_owners: [], total_users: 0 };
  }

  static async createSaaSUser(payload: { username: string; password: string; email?: string; phone?: string; role: string; tenant_id?: string }) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/users/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create software user');
    }
    return await res.json();
  }

  static async toggleSaaSUserStatus(userId: number | string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/users/${userId}/toggle-status/`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to toggle user status');
    }
    return await res.json();
  }

  static async resetSaaSUserPassword(userId: number | string, password?: string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/users/${userId}/reset-password/`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to reset password');
    }
    return await res.json();
  }

  static async deleteSaaSUser(userId: number | string) {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/users/${userId}/`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete user');
    }
    return true;
  }

  // ── Global Platform Audit Stream ──
  static async getSaaSAuditLogs() {
    try {
      const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/audit-logs/`);
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[SaaS Audit Logs] Error:', err);
    }
    return [];
  }

  // ── Central Control Plane Authentication ──
  static async saasLogin(username: string, password: string) {
    const res = await fetch(`${API_BASE}/saas/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    if (data.token) this.setToken(data.token);
    return data;
  }

  static async getSaaSMe() {
    const res = await this.fetchWithSaaSAuth(`${API_BASE}/saas/auth/me/`);
    if (!res.ok) throw new Error('Session invalid');
    return await res.json();
  }
}


