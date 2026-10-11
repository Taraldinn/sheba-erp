import { fetchApi } from './client';
import type { DashboardAnalytics } from './types';

export const reportsApi = {
    dashboard: () =>
        fetchApi<any>('/reports/dashboard/', { plane: 'tenant' }).then(res => {
            if (!res) return res;
            const kpis = res.kpis || {};
            return {
                ...res,
                total_customers: kpis.total_customers ?? kpis.total_subscribers ?? res.total_customers ?? 0,
                active_subscriptions: kpis.active_customers ?? kpis.active_subscribers ?? res.active_subscriptions ?? 0,
                total_due: kpis.total_due ?? res.total_due ?? 0,
                mrr: kpis.monthly_revenue ?? kpis.month_collection ?? res.mrr ?? 0,
                recent_payments: res.recent_payments || [],
            } as DashboardAnalytics;
        }),
};