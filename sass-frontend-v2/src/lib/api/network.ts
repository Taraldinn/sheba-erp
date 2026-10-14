import { fetchApi, toQuery } from './client';
import type {
    Router,
    NetworkProfile,
    PPPoEAccount,
    Olt,
    Onu,
    Branch,
    TJBox,
    Topology,
    PaginatedList,
} from './types';
import { asList } from './types';

export const routerApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Router>>(`/routers/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Router>(`/routers/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<Router>) => fetchApi<Router>('/routers/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<Router>) => fetchApi<Router>(`/routers/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/routers/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    syncNow: (id: string) => fetchApi<{ ok: boolean; job_id?: string }>(`/network/usage/sync/`, { method: 'POST', json: { router_id: id }, plane: 'tenant' }),
    test: (id: string) => fetchApi<{ ok: boolean; latency_ms?: number }>(`/routers/${id}/test-connection/`, { method: 'POST', plane: 'tenant' }),
};

export const networkProfileApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<NetworkProfile>>(`/network/profiles/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};

export const pppoeAccountApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<PPPoEAccount>>(`/network/pppoe/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};

export const oltApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Olt>>(`/olts/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Olt>(`/olts/${id}/`, { plane: 'tenant' }),
};

export const onuApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Onu>>(`/onus/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Onu>(`/onus/${id}/`, { plane: 'tenant' }),
};

export const branchesApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Branch>>(`/branches/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Branch>(`/branches/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<Branch>) => fetchApi<Branch>('/branches/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<Branch>) => fetchApi<Branch>(`/branches/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/branches/${id}/`, { method: 'DELETE', plane: 'tenant' }),
};

export const tjBoxesApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<TJBox>>(`/tj-boxes/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<TJBox>(`/tj-boxes/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<TJBox>) => fetchApi<TJBox>('/tj-boxes/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<TJBox>) => fetchApi<TJBox>(`/tj-boxes/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/tj-boxes/${id}/`, { method: 'DELETE', plane: 'tenant' }),
};

/**
 * Live topology — composed client-side from branches / routers / OLTs /
 * ONUs. The backend does not (yet) expose a single `/topology/` endpoint,
 * so we fetch each list in parallel and stitch them into a single
 * `Topology` shape. The Live Topology page renders this with a simple
 * nested-card view; a future iteration can swap the client-side stitch
 * for a dedicated server endpoint.
 */
export const topologyApi = {
    async fetch(): Promise<Topology> {
        const [branches, routers, olts, onus] = await Promise.all([
            fetchApi<PaginatedList<Branch>>('/branches/', { plane: 'tenant' }).then(r => asList(r)),
            fetchApi<PaginatedList<Router>>('/routers/', { plane: 'tenant' }).then(r => asList(r)),
            fetchApi<PaginatedList<Olt>>('/olts/', { plane: 'tenant' }).then(r => asList(r)),
            fetchApi<PaginatedList<Onu>>('/onus/?page_size=200', { plane: 'tenant' }).then(r => asList(r)),
        ]);

        const nodes: Topology['nodes'] = [];
        const edges: Topology['edges'] = [];

        // Branches are the top of the hierarchy — every router should
        // belong to a branch via `branch` (when present). Routers
        // without an explicit parent become top-level themselves.
        const routerById = new Map<string, Router>();
        for (const b of branches) {
            nodes.push({ id: `branch:${b.id}`, type: 'branch', name: b.name, status: b.status });
        }
        for (const r of routers) {
            const parent = (r as any).branch as string | undefined;
            const id = `router:${r.id}`;
            nodes.push({
                id,
                type: 'router',
                name: r.name,
                status: r.status,
                parent_id: parent ? `branch:${parent}` : null,
                metadata: { ip_address: r.ip_address, hostname: r.hostname },
            });
            routerById.set(r.id, r);
            if (parent) {
                edges.push({
                    source: `branch:${parent}`,
                    target: id,
                    kind: 'backhaul',
                    label: 'backhaul',
                });
            }
        }
        for (const o of olts) {
            const parent = (o as any).router as string | undefined;
            const id = `olt:${o.id}`;
            nodes.push({
                id,
                type: 'olt',
                name: o.name,
                status: o.status,
                parent_id: parent ? `router:${parent}` : null,
                metadata: { ip_address: o.ip_address, pon_ports: o.pon_ports },
            });
            if (parent) {
                edges.push({
                    source: `router:${parent}`,
                    target: id,
                    kind: 'distribution',
                    label: 'fiber',
                });
            }
        }
        for (const u of onus) {
            const parent = (u as any).olt as string | undefined;
            const id = `onu:${u.id}`;
            nodes.push({
                id,
                type: 'onu',
                name: u.serial_number || u.mac_address || u.id,
                status: u.status,
                parent_id: parent ? `olt:${parent}` : null,
                metadata: {
                    rx_signal_dbm: u.rx_signal_dbm,
                    pon_port: u.pon_port,
                    onu_index: u.onu_index,
                },
            });
            if (parent) {
                edges.push({
                    source: `olt:${parent}`,
                    target: id,
                    kind: 'access',
                    label: 'pon',
                });
            }
        }

        return { nodes, edges };
    },
};
