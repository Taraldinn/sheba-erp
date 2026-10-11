import { fetchApi, toQuery } from './client';
import type { CompanySetting, Branch, PaginatedList } from './types';
import { asList } from './types';

export const companySettingApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CompanySetting>>(`/settings/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    update: (id: string, data: Partial<CompanySetting>) =>
        fetchApi<CompanySetting>(`/settings/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
};

export const branchApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Branch>>(`/branches/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};
