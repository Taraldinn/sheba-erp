import { fetchApi, toQuery } from './client';
import type {
    Router,
    NetworkProfile,
    PPPoEAccount,
    Olt,
    Onu,
    Branch,
    BranchMetrics,
    TJBox,
    Topology,
    PaginatedList,
    PptpVpnConfig,
} from './types';
import { asList } from './types';

export interface RouterWorkspaceData {
    success: boolean;
    online: boolean;
    router: {
        id: string;
        name: string;
        ip: string;
        port: number;
        model?: string;
        hostname?: string;
    };
    identity: string;
    resource: {
        uptime?: string;
        version?: string;
        build_time?: string;
        cpu?: string;
        cpu_count?: number;
        cpu_frequency?: string;
        cpu_load?: number;
        free_memory?: number;
        total_memory?: number;
        memory_percent?: number;
        free_hdd_space?: number;
        total_hdd_space?: number;
        architecture?: string;
        board_name?: string;
        platform?: string;
    };
    routerboard: {
        model?: string;
        serial_number?: string;
        current_firmware?: string;
        upgrade_firmware?: string;
        factory_firmware?: string;
    };
    health: {
        temperature?: number;
        voltage?: number;
        fan1_speed?: number;
        fan2_speed?: number;
    };
    interfaces: Array<{
        id: string;
        name: string;
        type: string;
        physical: boolean;
        running: boolean;
        disabled: boolean;
        mtu: string | number;
        mac_address: string;
        rx_byte: number;
        tx_byte: number;
        rx_packet: number;
        tx_packet: number;
        rx_error: number;
        tx_error: number;
        link_downs: number;
        comment: string;
    }>;
    active_ports: number;
    total_ports: number;
    active_interfaces: number;
    total_interfaces: number;
    pppoe_active: number;
    total_secrets: number;
    profiles: number;
    latency_ms: number;
    traffic?: {
        interface: string;
        rx_bps: number;
        tx_bps: number;
        rx_pps: number;
        tx_pps: number;
    };
    collected_at: string;
}

export const routerApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Router>>(`/routers/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Router>(`/routers/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<Router>) => fetchApi<Router>('/routers/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<Router>) => fetchApi<Router>(`/routers/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/routers/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    syncNow: (id: string) => fetchApi<{ ok: boolean; job_id?: string }>(`/network/usage/sync/`, { method: 'POST', json: { router_id: id }, plane: 'tenant' }),
    test: (id?: string, data?: Record<string, unknown>) =>
        id
            ? fetchApi<{ ok?: boolean; success?: boolean; message?: string; details?: unknown; latency_ms?: number }>(`/routers/${id}/test-connection/`, {
                  method: 'POST',
                  json: data,
                  plane: 'tenant',
              })
            : fetchApi<{ ok?: boolean; success?: boolean; message?: string; details?: unknown; latency_ms?: number }>(`/routers/test-connection/`, {
                  method: 'POST',
                  json: data,
                  plane: 'tenant',
              }),
    workspace: (id: string, iface?: string) =>
        fetchApi<RouterWorkspaceData>(`/routers/${id}/workspace/${toQuery(iface ? { interface: iface } : {})}`, { plane: 'tenant' }),
    unregisteredSecrets: (id: string) =>
        fetchApi<{ router_id: string; count: number; secrets: Array<{ username: string; profile?: string; service?: string; caller_id?: string }> }>(`/routers/${id}/unregistered-secrets/`, { plane: 'tenant' }),
    quickImportSecret: (id: string, username: string) =>
        fetchApi<{ customer_id: string; username: string; message: string }>(`/routers/${id}/quick-import-secret/`, { method: 'POST', json: { username }, plane: 'tenant' }),
    syncAllClients: (id: string) =>
        fetchApi<{ message?: string; synced?: number }>(`/routers/${id}/sync-all-clients/`, { method: 'POST', plane: 'tenant' }),
    syncPppoe: (id: string) =>
        fetchApi<{ message?: string; sessions_synced?: number }>(`/routers/${id}/sync_pppoe/`, { method: 'POST', plane: 'tenant' }),
    syncProfiles: (id: string) =>
        fetchApi<{ router_id: string; profiles: string[] }>(`/routers/${id}/sync-profiles/`, { plane: 'tenant' }),
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
    create: (data: Partial<Olt> & Record<string, any>) => fetchApi<Olt>('/olts/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<Olt> & Record<string, any>) => fetchApi<Olt>(`/olts/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/olts/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    test: (id: string) => fetchApi<{ ok: boolean; message?: string }>(`/olts/${id}/test-connection/`, { method: 'POST', plane: 'tenant' }),
};

export const pptpVpnApi = {
    get: () => fetchApi<PptpVpnConfig>('/pptp-vpn/', { plane: 'tenant' }),
    save: (data: Partial<PptpVpnConfig> & { password?: string }) => fetchApi<PptpVpnConfig>('/pptp-vpn/', { method: 'POST', json: data, plane: 'tenant' }),
    connect: () => fetchApi<PptpVpnConfig>('/pptp-vpn/connect/', { method: 'POST', plane: 'tenant' }),
    diagnostics: () => fetchApi<{ success: boolean; reachability: string; details: any }>('/pptp-vpn/diagnostics/', { method: 'POST', plane: 'tenant' }),
};

export const onuApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Onu>>(`/onus/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Onu>(`/onus/${id}/`, { plane: 'tenant' }),
};

export const branchesApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Branch>>(`/branches/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    metrics: () =>
        fetchApi<BranchMetrics>('/branches/metrics/', { plane: 'tenant' }),
    get: (id: string) => fetchApi<Branch>(`/branches/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<Branch>) => fetchApi<Branch>('/branches/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<Branch>) => fetchApi<Branch>(`/branches/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/branches/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    markAsLeft: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/branches/${id}/mark-as-left/`, { method: 'POST', plane: 'tenant' }),
    restoreActive: (id: string) =>
        fetchApi<{ success: boolean; message: string }>(`/branches/${id}/restore-active/`, { method: 'POST', plane: 'tenant' }),
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

export interface LiveUsageSession {
    username: string;
    name: string;
    phone: string;
    ip: string;
    mac: string;
    uptime: string;
    upload_raw: number;
    download_raw: number;
    upload_formatted: string;
    download_formatted: string;
    rx_rate_mbps?: number;
    tx_rate_mbps?: number;
    package: string;
    status: string;
    router_name: string;
    router_id?: string;
}

export interface LiveUsageData {
    success: boolean;
    count: number;
    filtered_count: number;
    down_speed: number;
    up_speed: number;
    sample_id?: string;
    sample_time?: number;
    rate_mode?: string;
    page: number;
    limit: number;
    total_pages: number;
    sessions: LiveUsageSession[];
}

export interface WeeklyTrafficData {
    labels: string[];
    upload: number[];
    download: number[];
}

export const liveUsageApi = {
    getLive: (params?: { router_id?: string; search?: string; page?: number; limit?: number; force_refresh?: boolean }) =>
        fetchApi<LiveUsageData>(`/network/usage/live/${toQuery(params)}`, { plane: 'tenant' }),
    getCharts: (range: '7days' | '30days' = '7days') =>
        fetchApi<WeeklyTrafficData>(`/network/usage/charts/${toQuery({ range })}`, { plane: 'tenant' }),
    syncNow: () =>
        fetchApi<{ success: boolean; summary: string; details: any[] }>(`/network/usage/sync/`, { method: 'POST', plane: 'tenant' }),
    checkRouterStatus: (router_id: string) =>
        fetchApi<{ success: boolean; online: boolean; router_name: string; ip_address: string }>(`/network/usage/router-status/${toQuery({ router_id })}`, { plane: 'tenant' }),
    getReports: (params?: { type?: 'history' | 'top_users' | 'router_wise'; range?: string; date_from?: string; date_to?: string; router_id?: string }) =>
        fetchApi<any>(`/network/usage/reports/${toQuery(params)}`, { plane: 'tenant' }),
    disconnectSession: (data: { username: string; router_id?: string }) =>
        fetchApi<{ success: boolean; message: string }>(`/network/live-sessions/terminate/`, { method: 'POST', json: data, plane: 'tenant' }),
};
