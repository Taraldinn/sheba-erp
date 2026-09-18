import { mockCustomers, mockKPIs, mockPackages, mockRouters, mockOLTs, mockONUs, mockTransactions, mockSmsLogs, mockTickets } from './mock-data';
import {
  Customer, DashboardKPIs, Package, Router, OLT, ONU, PaymentTransaction,
  SmsLog, Ticket, NetworkCockpitDashboard, RouterCockpitDetail, OLTCockpitDetail,
  CustomerNetworkStatus, PPPoESecretItem, ReconciliationRun, CustomerNetworkIdentity,
  NetworkActionItem, BulkPreviewResult, BulkNetworkBatch,
  LiveSession, SessionHistoryItem, CustomerSessionTelemetry,
  NetworkTopologyGraph, GeoFiberMap, PathImpactAnalysis,
  OLTReconciliationRun, ONUAutoMatchResult,
  AuthoritativeHierarchyResponse, TopologyDrilldownResponse,
  CorporateCustomer, CorporateConnection, CorporateIPPool,
  CorporateIPAddress, CorporateVLAN, MRTGGraphResponse,
  CorporateBillingPeriod
} from '@/types';

import { TokenStorage } from './auth/token-storage';
import { AuthService } from './auth/auth-service';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Global client-side 401 interceptor for automatic session expiration handling
if (typeof window !== 'undefined') {
  const _originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await _originalFetch(...args);
    if (response.status === 401) {
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0]?.url || '';
      let isShebaApi = false;
      try {
        const reqUrl = new URL(url, window.location.origin);
        const configuredUrl = new URL(API_BASE, window.location.origin);
        if (reqUrl.origin === configuredUrl.origin) {
          const confPath = configuredUrl.pathname.replace(/\/+$/, '');
          isShebaApi = reqUrl.pathname === confPath || reqUrl.pathname.startsWith(`${confPath}/`);
        }
      } catch {
        isShebaApi = false;
      }
      if (isShebaApi && !url.includes('/auth/login/')) {
        TokenStorage.clearStoredAuth();
        window.dispatchEvent(new CustomEvent('sheba:unauthorized', { detail: { url } }));
      }
    }
    return response;
  };
}

export class ApiClient {
  private static token: string | null = null;
  private static tenantId: string = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'shebafi';

  static setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      TokenStorage.setStoredToken(token);
    }
  }

  static getToken(): string | null {
    if (typeof window !== 'undefined') {
      const stored = TokenStorage.getStoredToken();
      if (stored) return stored;
    }
    return this.token;
  }

  static getHeaders(): Record<string, string> {
    const token = this.getToken();
    const storedTenant = typeof window !== 'undefined' ? TokenStorage.getStoredTenantId() : null;
    const activeTenant = storedTenant || this.tenantId;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Token ${token}`;
    }
    if (activeTenant) {
      headers['X-Tenant-ID'] = activeTenant;
    }
    return headers;
  }

  // ════════════════════════ AUTH ════════════════════════
  static async login(username: string, password: string, contextType: 'tenant' | 'central_admin' = 'tenant', tenantId?: string) {
    const res = await AuthService.login({ username, password }, contextType, tenantId || this.tenantId);
    this.setToken(res.token);
    return res;
  }

  static async getCurrentUser() {
    const token = this.getToken();
    if (!token) return null;
    const contextType = typeof window !== 'undefined' ? TokenStorage.getStoredContextType() : 'tenant';
    const tenantId = typeof window !== 'undefined' ? TokenStorage.getStoredTenantId() : this.tenantId;
    return await AuthService.getCurrentUser(token, contextType, tenantId || undefined);
  }

  // ════════════════════════ DASHBOARD & ANALYTICS ════════════════════════
  static async getDashboardKPIs(): Promise<DashboardKPIs> {
    try {
      const res = await fetch(`${API_BASE}/reports/dashboard/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.kpis;
      }
    } catch { }
    return mockKPIs;
  }

  static async getDashboardAnalytics(role: string = 'admin') {
    try {
      const res = await fetch(`${API_BASE}/reports/dashboard/?role=${role}`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch { }
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
    } catch { }
    return mockCustomers;
  }

  static async getCustomer(id: string): Promise<Customer | null> {
    try {
      const res = await fetch(`${API_BASE}/customers/${id}/`, { headers: this.getHeaders() });
      if (res.ok) return await res.json();
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
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
    } catch { }
    return [];
  }

  static async createStaff(payload: any) {
    const res = await fetch(`${API_BASE}/staff/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err === 'object' ? (err.detail || err.error || JSON.stringify(err)) : 'Failed to create staff member');
    }
    return await res.json();
  }

  static async updateStaff(id: string, payload: any) {
    const res = await fetch(`${API_BASE}/staff/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err === 'object' ? (err.detail || err.error || JSON.stringify(err)) : 'Failed to update staff member');
    }
    return await res.json();
  }

  static async deleteStaff(id: string) {
    const res = await fetch(`${API_BASE}/staff/${id}/`, { method: 'DELETE', headers: this.getHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err === 'object' ? (err.detail || err.error || 'Failed to delete staff member') : 'Failed to delete staff member');
    }
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
    } catch { }
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || 'Failed to delete role');
    }
    return true;
  }

  static async getPermissions() {
    try {
      const res = await fetch(`${API_BASE}/permissions/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || data;
      }
    } catch { }
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
    } catch { }
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
    } catch { }
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

    const res = await fetch(url, { ...options, headers: mergedHeaders });

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        TokenStorage.clearStoredAuth();
        window.dispatchEvent(new CustomEvent('sheba:unauthorized', { detail: { url } }));
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

  // ════════════════════════ PHASE 11: NETWORK OPERATIONS COCKPIT ════════════════════════

  static async getNetworkCockpit(params?: { pop_id?: string; area?: string; refresh?: boolean }): Promise<NetworkCockpitDashboard> {
    try {
      const q = new URLSearchParams();
      if (params?.pop_id) q.set('pop_id', params.pop_id);
      if (params?.area) q.set('area', params.area);
      if (params?.refresh) q.set('refresh', 'true');
      const url = `${API_BASE}/network/cockpit/dashboard/${q.toString() ? `?${q.toString()}` : ''}`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[Network Cockpit] API unreachable, falling back to cached baseline state:', e);
    }
    // Fallback baseline conforming to exact Phase 11 specs
    return {
      routers: {
        total: 24,
        healthy: 22,
        degraded: 2,
        avg_cpu_usage: 34.2,
        avg_memory_usage: 52.8,
        avg_disk_usage: 21.0,
      },
      customers: {
        total: 9659,
        online: 8421,
        offline: 1238,
        active: 9140,
        expired: 519,
      },
      pending_actions: 13,
      failed_actions: 4,
      olt: {
        total: 19,
        healthy: 18,
        degraded: 1,
      },
      onu: {
        total: 12514,
        online: 12421,
        offline: 93,
        optical_alerts: 14,
      },
      sessions: {
        total_active: 8421,
        bytes_in: 41258900000000,
        bytes_out: 185620000000000,
        total_gb: 211.2,
      },
      recent_failures: [
        {
          id: 'job-err-1',
          action: 'DISABLE_USER',
          status: 'FAILED',
          error_message: 'MikroTik API Connection Refused on CCR-2004-East (Timeout after 5s)',
          retry_count: 3,
          router_name: 'CCR-2004-East',
          customer_code: 'CUST-8492',
          pppoe_username: 'tanvir_net',
          created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        },
        {
          id: 'job-err-2',
          action: 'UPDATE_PACKAGE',
          status: 'FAILED',
          error_message: 'PPP Profile "prof_50m" does not exist on Router CCR-1036-North',
          retry_count: 2,
          router_name: 'CCR-1036-North',
          customer_code: 'CUST-3910',
          pppoe_username: 'sakib_wifi',
          created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        },
      ],
      pop_branches: [
        { id: 'pop-1', name: 'Dhanmondi Central POP', code: 'POP-DHD', location: 'Dhanmondi 27', total_capacity: 5000, status: 'Active', customer_count: 4210 },
        { id: 'pop-2', name: 'Mirpur Hub POP', code: 'POP-MIR', location: 'Mirpur 10', total_capacity: 4000, status: 'Active', customer_count: 3180 },
        { id: 'pop-3', name: 'Uttara North POP', code: 'POP-UTR', location: 'Uttara Sector 7', total_capacity: 3000, status: 'Active', customer_count: 2269 },
      ],
      area_breakdown: [
        { area_zone: 'Mirpur-10 Hub', total_subscribers: 2840, online_count: 2510, offline_count: 330, expired_count: 94 },
        { area_zone: 'Dhanmondi-R/A', total_subscribers: 2410, online_count: 2190, offline_count: 220, expired_count: 65 },
        { area_zone: 'Uttara-Sector-7', total_subscribers: 1890, online_count: 1720, offline_count: 170, expired_count: 52 },
        { area_zone: 'Gulshan-2', total_subscribers: 1420, online_count: 1280, offline_count: 140, expired_count: 38 },
        { area_zone: 'Banani-Commercial', total_subscribers: 1099, online_count: 721, offline_count: 378, expired_count: 270 },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  static async getRouterCockpit(routerId: string, area?: string): Promise<RouterCockpitDetail> {
    const q = area ? `?area=${encodeURIComponent(area)}` : '';
    const res = await fetch(`${API_BASE}/network/cockpit/routers/${routerId}/${q}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch router operational detail');
    return await res.json();
  }

  static async getOLTCockpit(oltId: string): Promise<OLTCockpitDetail> {
    const res = await fetch(`${API_BASE}/network/cockpit/olts/${oltId}/`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch OLT operational detail');
    return await res.json();
  }

  static async getCustomerNetworkStatus(customerId: string): Promise<CustomerNetworkStatus> {
    const res = await fetch(`${API_BASE}/network/cockpit/customers/${customerId}/`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch customer network status');
    return await res.json();
  }

  static async triggerCustomerNetworkAction(
    customerId: string,
    action: 'disconnect' | 'sync_profile' | 'reboot_onu'
  ): Promise<{ success: boolean; action: string; message: string; job_id?: string; error?: string }> {
    const res = await fetch(`${API_BASE}/network/cockpit/customers/${customerId}/action/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Network action failed');
    }
    return data;
  }

  // ════════════════════════ PHASE 12: MIKROTIK RECONCILIATION ════════════════════════

  static async getReconciliationSecrets(params?: {
    router_id?: string;
    status?: string;
    area?: string;
    search?: string;
  }): Promise<PPPoESecretItem[]> {
    try {
      const q = new URLSearchParams();
      if (params?.router_id) q.set('router_id', params.router_id);
      if (params?.status) q.set('status', params.status);
      if (params?.area) q.set('area', params.area);
      if (params?.search) q.set('search', params.search);
      const url = `${API_BASE}/network/reconciliation/secrets/${q.toString() ? `?${q.toString()}` : ''}`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn('[Reconciliation] Failed to fetch secrets, falling back to mock baseline:', e);
    }
    return [
      {
        id: 'sec-1',
        router: 'r-1',
        router_name: 'Core-CCR-East',
        router_ip: '10.10.1.1',
        customer: 'c-1',
        customer_code: 'CUST-8491',
        customer_name: 'Rahim Ahmed',
        customer_status: 'Active',
        customer_area: 'Mirpur-10 Hub',
        package_name: '20 Mbps Premium',
        username: 'rahim_net',
        reconciliation_status: 'MATCHED',
        router_profile: 'prof_20m',
        expected_profile: 'prof_20m',
        router_disabled: false,
        expected_disabled: false,
        router_comment: 'Synced from ERP',
        discrepancy_details: { match: true },
        last_reconciled_at: new Date().toISOString(),
      },
      {
        id: 'sec-2',
        router: 'r-1',
        router_name: 'Core-CCR-East',
        router_ip: '10.10.1.1',
        customer: 'c-2',
        customer_code: 'CUST-8492',
        customer_name: 'Karim Ullah',
        customer_status: 'Active',
        customer_area: 'Dhanmondi-R/A',
        package_name: '50 Mbps VIP',
        username: 'karim_wifi',
        reconciliation_status: 'PROFILE_MISMATCH',
        router_profile: 'prof_20m',
        expected_profile: 'prof_50m',
        router_disabled: false,
        expected_disabled: false,
        router_comment: 'Needs package sync',
        discrepancy_details: { issue: 'Profile mismatch', expected_profile: 'prof_50m', actual_profile: 'prof_20m' },
        last_reconciled_at: new Date().toISOString(),
      },
      {
        id: 'sec-3',
        router: 'r-1',
        router_name: 'Core-CCR-East',
        router_ip: '10.10.1.1',
        customer: 'c-3',
        customer_code: 'CUST-8493',
        customer_name: 'Jamal Khan',
        customer_status: 'Expired',
        customer_area: 'Uttara-Sector-7',
        package_name: '20 Mbps Premium',
        username: 'jamal_speed',
        reconciliation_status: 'STATUS_MISMATCH',
        router_profile: 'prof_20m',
        expected_profile: 'prof_20m',
        router_disabled: false,
        expected_disabled: true,
        router_comment: 'User unpaid but still active on router',
        discrepancy_details: { issue: 'Operational status mismatch', expected_disabled: true, actual_disabled: false },
        last_reconciled_at: new Date().toISOString(),
      },
      {
        id: 'sec-4',
        router: 'r-1',
        router_name: 'Core-CCR-East',
        router_ip: '10.10.1.1',
        customer: null,
        username: 'unknown_guest_router',
        reconciliation_status: 'UNKNOWN_IN_ERP',
        router_profile: 'default',
        expected_profile: '',
        router_disabled: false,
        expected_disabled: null,
        router_comment: 'Manual entry directly on router',
        discrepancy_details: { issue: 'Orphan secret on router' },
        last_reconciled_at: new Date().toISOString(),
      },
      {
        id: 'sec-5',
        router: 'r-1',
        router_name: 'Core-CCR-East',
        router_ip: '10.10.1.1',
        customer: 'c-5',
        customer_code: 'CUST-8495',
        customer_name: 'Sultan Mahmud',
        customer_status: 'Active',
        customer_area: 'Gulshan-2',
        package_name: '30 Mbps Standard',
        username: 'sultan_fiber',
        reconciliation_status: 'MISSING_IN_ROUTER',
        router_profile: '',
        expected_profile: 'prof_30m',
        router_disabled: null,
        expected_disabled: false,
        discrepancy_details: { issue: 'Secret missing from MikroTik router' },
        last_reconciled_at: new Date().toISOString(),
      },
    ];
  }

  static async getReconciliationRuns(): Promise<ReconciliationRun[]> {
    try {
      const res = await fetch(`${API_BASE}/network/reconciliation/runs/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch { }
    return [];
  }

  static async triggerReconciliation(routerId: string, runAsync = false): Promise<any> {
    const res = await fetch(`${API_BASE}/network/reconciliation/trigger/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ router_id: routerId, run_async: runAsync }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reconciliation trigger failed');
    return data;
  }

  static async safeSyncReconciliationItem(itemId: string, action: string): Promise<{ success: boolean; message: string; job_id?: string; error?: string }> {
    const res = await fetch(`${API_BASE}/network/reconciliation/items/${itemId}/sync/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Safe sync failed');
    return data;
  }

  static async getCustomerNetworkIdentity(customerId: string): Promise<CustomerNetworkIdentity> {
    const res = await fetch(`${API_BASE}/network/reconciliation/customers/${customerId}/identity/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch customer network identity');
    return await res.json();
  }

  // ════════════════════════ PHASE 13: ACTION QUEUE & BULK OPS ════════════════════════
  static async getNetworkActions(params?: { status?: string; action?: string; router_id?: string; search?: string }): Promise<NetworkActionItem[]> {
    try {
      const url = new URL(`${API_BASE}/network/actions/`);
      if (params?.status) url.searchParams.append('status', params.status);
      if (params?.action) url.searchParams.append('action', params.action);
      if (params?.router_id) url.searchParams.append('router_id', params.router_id);
      if (params?.search) url.searchParams.append('search', params.search);

      const res = await fetch(url.toString(), { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch { }
    return [];
  }

  static async enqueueNetworkAction(payload: { action: string; customer_id?: string; router_id?: string; payload?: any; idempotency_key?: string }): Promise<NetworkActionItem> {
    const res = await fetch(`${API_BASE}/network/actions/enqueue/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to enqueue network action');
    return data;
  }

  static async retryNetworkAction(actionId: string): Promise<NetworkActionItem> {
    const res = await fetch(`${API_BASE}/network/actions/${actionId}/retry/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to retry action');
    return data;
  }

  static async cancelNetworkAction(actionId: string): Promise<NetworkActionItem> {
    const res = await fetch(`${API_BASE}/network/actions/${actionId}/cancel/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel action');
    return data;
  }

  static async previewBulkOperation(payload: { action_type: string; filter_criteria?: any; target_ids?: string[]; payload?: any }): Promise<BulkPreviewResult> {
    const res = await fetch(`${API_BASE}/network/bulk/preview/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bulk preview failed');
    return data;
  }

  static async confirmBulkOperation(payload: { action_type: string; filter_criteria?: any; target_ids?: string[]; payload?: any }): Promise<BulkNetworkBatch> {
    const res = await fetch(`${API_BASE}/network/bulk/confirm/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bulk confirmation failed');
    return data;
  }

  static async getBulkBatches(): Promise<BulkNetworkBatch[]> {
    try {
      const res = await fetch(`${API_BASE}/network/bulk/batches/`, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.results || (Array.isArray(data) ? data : []);
      }
    } catch { }
    return [];
  }

  static async getBulkBatchDetail(batchId: string): Promise<BulkNetworkBatch> {
    const res = await fetch(`${API_BASE}/network/bulk/${batchId}/detail/`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch bulk batch details');
    return await res.json();
  }

  static async cancelBulkBatch(batchId: string): Promise<BulkNetworkBatch> {
    const res = await fetch(`${API_BASE}/network/bulk/${batchId}/cancel/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to cancel bulk batch');
    return await res.json();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 14: Live Sessions, Traffic & Topology APIs
  // ─────────────────────────────────────────────────────────────────────────

  static async getLiveSessions(params?: {
    router?: string;
    search?: string;
    status?: string;
    refresh?: boolean;
  }): Promise<{ count: number; from_cache: boolean; sessions: LiveSession[] }> {
    const query = new URLSearchParams();
    if (params?.router) query.append('router', params.router);
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.refresh) query.append('refresh', 'true');

    const res = await fetch(`${API_BASE}/network/live-sessions/?${query.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch live PPPoE sessions');
    return await res.json();
  }

  static async terminateSession(username: string, routerId?: string): Promise<{ success: boolean; message: string; router_dropped?: boolean }> {
    const res = await fetch(`${API_BASE}/network/live-sessions/terminate/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ username, router_id: routerId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to terminate session');
    }
    return await res.json();
  }

  static async getCustomerSessionTelemetry(customerId: string): Promise<CustomerSessionTelemetry> {
    const res = await fetch(`${API_BASE}/network/live-sessions/customer/${customerId}/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch customer session telemetry');
    return await res.json();
  }

  static async getUserSessionHistory(username?: string, routerId?: string): Promise<{ count: number; results: SessionHistoryItem[] }> {
    const query = new URLSearchParams();
    if (username) query.append('username', username);
    if (routerId) query.append('router', routerId);
    const res = await fetch(`${API_BASE}/network/live-sessions/history/?${query.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch session history');
    return await res.json();
  }

  static async getNetworkTopology(): Promise<NetworkTopologyGraph> {
    const res = await fetch(`${API_BASE}/network/topology/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch network topology');
    return await res.json();
  }

  static async getGeographicalFiberMap(): Promise<GeoFiberMap> {
    const res = await fetch(`${API_BASE}/network/geo-map/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch geographical fiber map');
    return await res.json();
  }

  static async getPathImpactAnalysis(targetType: string, targetId: string): Promise<PathImpactAnalysis> {
    const res = await fetch(`${API_BASE}/network/impact-analysis/?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to calculate path impact analysis');
    }
    return await res.json();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 20: Authoritative Topology & Impact Analysis APIs
  // ─────────────────────────────────────────────────────────────────────────

  static async getAuthoritativeTopology(): Promise<AuthoritativeHierarchyResponse> {
    const res = await fetch(`${API_BASE}/network/topology/hierarchy/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch authoritative topology hierarchy');
    return await res.json();
  }

  static async getTopologyDrilldown(
    nodeType: string,
    nodeId: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<TopologyDrilldownResponse> {
    const params = new URLSearchParams({
      node_type: nodeType,
      node_id: nodeId,
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (search) params.append('search', search);

    const res = await fetch(`${API_BASE}/network/topology/drilldown/?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch topology drilldown');
    }
    return await res.json();
  }

  static async simulateAuthoritativeImpact(targetType: string, targetId: string): Promise<PathImpactAnalysis> {
    const res = await fetch(`${API_BASE}/network/topology/impact/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ target_type: targetType, target_id: targetId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to simulate authoritative failure impact');
    }
    return await res.json();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 15: OLT / ONU Operations & Reconciliation APIs
  // ─────────────────────────────────────────────────────────────────────────

  static async getOLTReconciliationRuns(oltId?: string): Promise<{ count: number; results: OLTReconciliationRun[] }> {
    const query = oltId ? `?olt=${encodeURIComponent(oltId)}` : '';
    const res = await fetch(`${API_BASE}/network/olt-reconciliation/runs/${query}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch OLT reconciliation runs');
    return await res.json();
  }

  static async triggerOLTReconciliation(oltId: string, ponPort?: string): Promise<OLTReconciliationRun> {
    const res = await fetch(`${API_BASE}/network/olt-reconciliation/${oltId}/trigger/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ pon_port: ponPort }),
    });
    if (!res.ok) throw new Error('Failed to trigger OLT reconciliation');
    return await res.json();
  }

  static async autoMatchONUs(oltId: string, dryRun: boolean = false): Promise<ONUAutoMatchResult> {
    const res = await fetch(`${API_BASE}/network/onus/auto-match/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ olt_id: oltId, dry_run: dryRun }),
    });
    if (!res.ok) throw new Error('Failed to run ONU auto-matching');
    return await res.json();
  }

  static async bindONU(onuId: string, customerId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/network/onus/${onuId}/bind/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ customer_id: customerId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to bind ONU');
    }
    return await res.json();
  }

  static async unbindONU(onuId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/network/onus/${onuId}/unbind/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to unbind ONU');
    }
    return await res.json();
  }

  // ════════════════════════ CORPORATE / ENTERPRISE (STAGE 11) ════════════════════════
  static async getCorporateCustomers(params?: { search?: string; status?: string }): Promise<CorporateCustomer[]> {
    const url = new URL(`${API_BASE}/corporate/customers/`);
    if (params?.search) url.searchParams.append('search', params.search);
    if (params?.status) url.searchParams.append('status', params.status);
    const res = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch corporate customers');
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  static async getCorporateCustomer(id: string): Promise<CorporateCustomer> {
    const res = await fetch(`${API_BASE}/corporate/customers/${id}/`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch corporate customer');
    return await res.json();
  }

  static async getCorporateCustomerSummary(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/corporate/customers/${id}/summary/`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch corporate customer summary');
    return await res.json();
  }

  static async createCorporateCustomer(data: Partial<CorporateCustomer>): Promise<CorporateCustomer> {
    const res = await fetch(`${API_BASE}/corporate/customers/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(JSON.stringify(err) || 'Failed to create corporate customer');
    }
    return await res.json();
  }

  static async updateCorporateCustomer(id: string, data: Partial<CorporateCustomer>): Promise<CorporateCustomer> {
    const res = await fetch(`${API_BASE}/corporate/customers/${id}/`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(JSON.stringify(err) || 'Failed to update corporate customer');
    }
    return await res.json();
  }

  static async deleteCorporateCustomer(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/corporate/customers/${id}/`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete corporate customer');
  }

  static async getCorporateConnections(params?: { corporate_customer?: string; status?: string }): Promise<CorporateConnection[]> {
    const url = new URL(`${API_BASE}/corporate/connections/`);
    if (params?.corporate_customer) url.searchParams.append('corporate_customer', params.corporate_customer);
    if (params?.status) url.searchParams.append('status', params.status);
    const res = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch corporate connections');
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  static async createCorporateConnection(data: Partial<CorporateConnection>): Promise<CorporateConnection> {
    const res = await fetch(`${API_BASE}/corporate/connections/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(JSON.stringify(err) || 'Failed to create corporate connection');
    }
    return await res.json();
  }

  static async allocateCorporateIP(connectionId: string, payload: { pool_id?: string; ip_address?: string; notes?: string }): Promise<CorporateIPAddress> {
    const res = await fetch(`${API_BASE}/corporate/connections/${connectionId}/allocate-ip/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || JSON.stringify(err) || 'Failed to allocate IP');
    }
    return await res.json();
  }

  static async assignCorporateVLAN(connectionId: string, payload: { router_id: string; vlan_id: number; name?: string; interface_name?: string; description?: string }): Promise<CorporateVLAN> {
    const res = await fetch(`${API_BASE}/corporate/connections/${connectionId}/assign-vlan/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || JSON.stringify(err) || 'Failed to assign VLAN');
    }
    return await res.json();
  }

  static async releaseCorporateVLAN(connectionId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/corporate/connections/${connectionId}/release-vlan/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to release VLAN');
  }

  static async getCorporateIPPools(): Promise<CorporateIPPool[]> {
    const res = await fetch(`${API_BASE}/corporate/ip-pools/`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch IP pools');
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  static async createCorporateIPPool(data: Partial<CorporateIPPool>): Promise<CorporateIPPool> {
    const res = await fetch(`${API_BASE}/corporate/ip-pools/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create IP pool');
    return await res.json();
  }

  static async populateCorporateIPPoolHosts(poolId: string): Promise<{ created_count: number }> {
    const res = await fetch(`${API_BASE}/corporate/ip-pools/${poolId}/populate-hosts/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to populate pool hosts');
    return await res.json();
  }

  static async getCorporateIPAddresses(params?: { pool?: string; status?: string }): Promise<CorporateIPAddress[]> {
    const url = new URL(`${API_BASE}/corporate/ip-addresses/`);
    if (params?.pool) url.searchParams.append('pool', params.pool);
    if (params?.status) url.searchParams.append('status', params.status);
    const res = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch IP addresses');
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  static async releaseCorporateIP(ipId: string): Promise<CorporateIPAddress> {
    const res = await fetch(`${API_BASE}/corporate/ip-addresses/${ipId}/release/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to release IP');
    return await res.json();
  }

  static async getCorporateVLANs(params?: { router?: string }): Promise<CorporateVLAN[]> {
    const url = new URL(`${API_BASE}/corporate/vlans/`);
    if (params?.router) url.searchParams.append('router', params.router);
    const res = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch VLANs');
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  static async createCorporateVLAN(payload: {
    router: string;
    vlan_id: number;
    name?: string;
    interface_name?: string;
    description?: string;
  }): Promise<CorporateVLAN> {
    const res = await fetch(`${API_BASE}/corporate/vlans/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || JSON.stringify(err) || 'Failed to create VLAN');
    }
    return await res.json();
  }

  static async releaseCorporateVLANRecord(vlanId: string): Promise<CorporateVLAN> {
    const res = await fetch(`${API_BASE}/corporate/vlans/${vlanId}/release/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to release VLAN record');
    return await res.json();
  }

  static async getCorporateMRTGGraph(params: { connection_id?: string; customer_id?: string; hours?: number }): Promise<MRTGGraphResponse> {
    const url = new URL(`${API_BASE}/corporate/telemetry/mrtg-graph/`);
    if (params.connection_id) url.searchParams.append('connection_id', params.connection_id);
    if (params.customer_id) url.searchParams.append('customer_id', params.customer_id);
    if (params.hours) url.searchParams.append('hours', params.hours.toString());
    const res = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch MRTG graph data');
    return await res.json();
  }

  static async getCorporateBillingPeriods(params?: { corporate_customer?: string; status?: string }): Promise<CorporateBillingPeriod[]> {
    const url = new URL(`${API_BASE}/corporate/billing-periods/`);
    if (params?.corporate_customer) url.searchParams.append('corporate_customer', params.corporate_customer);
    if (params?.status) url.searchParams.append('status', params.status);
    const res = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch billing periods');
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }

  static async createCorporateBillingPeriod(payload: {
    corporate_customer: string;
    period_start: string;
    period_end: string;
  }): Promise<CorporateBillingPeriod> {
    const res = await fetch(`${API_BASE}/corporate/billing-periods/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create billing period');
    }
    return await res.json();
  }

  static async calculateCorporateBillingPeriod(periodId: string): Promise<CorporateBillingPeriod> {
    const res = await fetch(`${API_BASE}/corporate/billing-periods/${periodId}/calculate/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to calculate billing period');
    }
    return await res.json();
  }

  static async finalizeCorporateInvoice(periodId: string): Promise<{ invoice_id: string; invoice_no: string; total_payable: string; status: string }> {
    const res = await fetch(`${API_BASE}/corporate/billing-periods/${periodId}/finalize-invoice/`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to finalize corporate invoice');
    }
    return await res.json();
  }
}





