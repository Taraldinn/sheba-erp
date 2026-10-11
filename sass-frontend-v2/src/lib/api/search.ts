import { fetchApi } from './client';
import type { SearchResult } from './types';

export const searchApi = {
    global: (q: string) =>
        fetchApi<{ query: string; count: number; results: SearchResult[] }>(`/search/?q=${encodeURIComponent(q.trim())}`, { plane: 'tenant' }),
};