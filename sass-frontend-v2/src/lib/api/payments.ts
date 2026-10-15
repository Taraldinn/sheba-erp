import { fetchApi, toQuery } from './client';
import type {
    PaymentTransaction,
    PaginatedList,
    SMSGatewayDevice,
    PaymentVerificationRequest,
    VerificationSmsLog,
    PaymentVerificationStats,
} from './types';
import { asList } from './types';

export const paymentApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<PaymentTransaction>>(`/payments/transactions/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<PaymentTransaction>(`/payments/transactions/${id}/`, { plane: 'tenant' }),
};

export const paymentVerificationApi = {
    getStats: () =>
        fetchApi<PaymentVerificationStats>('/payments/verification/stats/', { plane: 'tenant' }),

    // Customer Verification Requests
    listRequests: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<PaymentVerificationRequest>>(`/payment-verification-requests/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    createRequest: (data: Partial<PaymentVerificationRequest>) =>
        fetchApi<PaymentVerificationRequest>('/payment-verification-requests/', { method: 'POST', json: data, plane: 'tenant' }),
    verifyRequest: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/payment-verification-requests/${id}/verify/`, { method: 'POST', plane: 'tenant' }),
    rejectRequest: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/payment-verification-requests/${id}/reject/`, { method: 'POST', plane: 'tenant' }),

    // SMS Gateway Devices
    listDevices: () =>
        fetchApi<PaginatedList<SMSGatewayDevice>>('/payment-devices/', { plane: 'tenant' }).then(r => asList(r)),
    createDevice: (data: Partial<SMSGatewayDevice>) =>
        fetchApi<SMSGatewayDevice>('/payment-devices/', { method: 'POST', json: data, plane: 'tenant' }),
    updateDevice: (id: string, data: Partial<SMSGatewayDevice>) =>
        fetchApi<SMSGatewayDevice>(`/payment-devices/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    removeDevice: (id: string) =>
        fetchApi<void>(`/payment-devices/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    generateToken: () =>
        fetchApi<{ api_token: string }>('/payment-devices/generate-token/', { method: 'POST', plane: 'tenant' }),
    toggleDeviceStatus: (id: string) =>
        fetchApi<{ status: string; device_id: string }>(`/payment-devices/${id}/toggle-status/`, { method: 'POST', plane: 'tenant' }),

    // SMS Logs
    listSmsLogs: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<VerificationSmsLog>>(`/sms-logs/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};