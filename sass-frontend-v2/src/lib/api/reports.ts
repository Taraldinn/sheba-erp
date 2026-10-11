import { fetchApi } from './client';
import type { DashboardAnalytics } from './types';

export const reportsApi = {
    dashboard: () => fetchApi<DashboardAnalytics>('/reports/dashboard/', { plane: 'tenant' }),
};