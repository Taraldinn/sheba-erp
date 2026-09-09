/**
 * Customer Self-Care Portal API Client.
 * Handles customer authentication (OTP -> JWT), live session diagnostics,
 * invoice retrieval, tickets, and payment integrations (bKash & MFS claim).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export class PortalApiClient {
  private static tokenKey = 'sheba_portal_customer_jwt';

  static setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.tokenKey, token);
    }
  }

  static getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.tokenKey);
    }
    return null;
  }

  static clearToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.tokenKey);
    }
  }

  static isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // ════════════════════════ AUTHENTICATION ════════════════════════
  static async requestOtp(identifier: string) {
    const res = await fetch(`${API_BASE}/portal/auth/request-otp/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to request OTP');
    }
    return data;
  }

  static async verifyOtp(identifier: string, otp: string) {
    const res = await fetch(`${API_BASE}/portal/auth/verify-otp/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, otp }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid verification code');
    }
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  // ════════════════════════ SELF-CARE APIS ════════════════════════
  static async getProfile() {
    const res = await fetch(`${API_BASE}/portal/profile/`, {
      headers: this.getHeaders(),
    });
    if (res.status === 401) {
      this.clearToken();
      throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) throw new Error('Failed to load profile');
    return await res.json();
  }

  static async getSession() {
    const res = await fetch(`${API_BASE}/portal/session/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return { is_online: false, uptime: '0s', bytes_in: 0, bytes_out: 0 };
    return await res.json();
  }

  static async getPackages() {
    const res = await fetch(`${API_BASE}/portal/packages/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  }

  static async getInvoices() {
    const res = await fetch(`${API_BASE}/portal/invoices/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || data;
  }

  static async getNotifications() {
    const res = await fetch(`${API_BASE}/portal/notifications/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return { notifications: [] };
    return await res.json();
  }

  // ════════════════════════ SUPPORT TICKETS ════════════════════════
  static async getTickets() {
    const res = await fetch(`${API_BASE}/portal/tickets/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || data;
  }

  static async createTicket(ticket: {
    category: string;
    subject: string;
    description: string;
    priority: string;
  }) {
    const res = await fetch(`${API_BASE}/portal/tickets/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(ticket),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit ticket');
    return data;
  }

  static async replyTicket(ticketId: string, message: string) {
    const res = await fetch(`${API_BASE}/portal/tickets/${ticketId}/reply/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to post reply');
    return data;
  }

  // ════════════════════════ PAYMENTS & RECHARGE ════════════════════════
  static async createBkashPayment(amount?: number | string, invoiceNo?: string) {
    const body: Record<string, any> = {};
    if (amount) body.amount = amount;
    if (invoiceNo) body.invoice_no = invoiceNo;

    const res = await fetch(`${API_BASE}/portal/payments/bkash/create/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to initiate bKash payment');
    return data;
  }

  static async executeBkashPayment(paymentId: string) {
    const res = await fetch(`${API_BASE}/portal/payments/bkash/execute/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ payment_id: paymentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'bKash execution failed');
    return data;
  }

  static async claimManualMfsPayment(trxId: string) {
    const res = await fetch(`${API_BASE}/portal/payments/claim/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ trx_id: trxId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to claim transaction');
    return data;
  }

  static async recharge(packageId?: string) {
    const body: Record<string, any> = {};
    if (packageId) body.package_id = packageId;

    const res = await fetch(`${API_BASE}/portal/recharge/`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 402) {
        return { insufficient_balance: true, ...data };
      }
      throw new Error(data.error || data.message || 'Recharge request failed');
    }
    return data;
  }

  static async getRechargeHistory() {
    const res = await fetch(`${API_BASE}/portal/recharge/history/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return { recharges: [] };
    return await res.json();
  }

  static async getPaymentHistory() {
    const res = await fetch(`${API_BASE}/portal/payments/history/`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return { payments: [] };
    return await res.json();
  }
}
