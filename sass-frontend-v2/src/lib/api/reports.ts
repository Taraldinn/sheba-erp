import { fetchApi } from './client';
import type { DashboardAnalytics } from './types';

export const reportsApi = {
    dashboard: (role?: string) => {
        const query = role ? `?role=${encodeURIComponent(role)}` : '';
        return fetchApi<any>(`/reports/dashboard/${query}`, { plane: 'tenant' }).then(res => {
            if (!res) return res;
            const kpis = res.kpis || {};
            return {
                ...res,
                total_customers: kpis.total_clients ?? kpis.total_customers ?? kpis.total_subscribers ?? res.total_customers ?? 0,
                active_subscriptions: kpis.active_clients ?? kpis.active_customers ?? kpis.active_subscribers ?? res.active_subscriptions ?? 0,
                total_due: kpis.outstanding_bill ?? kpis.total_due ?? res.total_due ?? 0,
                mrr: kpis.monthly_revenue ?? kpis.month_collection ?? res.mrr ?? 0,
                recent_payments: res.recent_payments || [],
                financial_communication_history: res.financial_communication_history || [],
                client_distribution: res.client_distribution || {},
                action_required: res.action_required || {},
                recent_activity: res.recent_activity || [],
            } as DashboardAnalytics;
        });
    },
};