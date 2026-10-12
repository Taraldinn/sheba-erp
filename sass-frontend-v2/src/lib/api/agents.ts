/**
 * Tenant-plane Callcenter / Agent endpoints. Backed by `apps.callcenter.*`
 * and `apps.support.*` (the `agent-pbx-mappings`, `call-logs`,
 * `voice-settings`, `voice-templates`, and `mikopbx-config` routers
 * under `/api/v1/`).
 */
import { fetchApi, toQuery } from './client';
import type { PaginatedList } from './types';
import { asList } from './types';

export interface AgentPbxMapping {
    id: string;
    staff?: string;
    staff_name?: string;
    agent_id?: string;
    extension?: string;
    pbx_extension?: string;
    is_active: boolean;
    last_call_at?: string;
    created_at: string;
}

export interface CallLog {
    id: string;
    agent?: string;
    agent_name?: string;
    direction: 'inbound' | 'outbound';
    customer_number?: string;
    started_at?: string;
    ended_at?: string;
    duration_seconds?: number;
    status: 'completed' | 'missed' | 'abandoned' | 'ongoing' | 'voicemail';
    recording_url?: string;
    notes?: string;
    created_at: string;
}

export interface VoiceTemplate {
    id: string;
    name: string;
    body: string;
    language?: string;
    is_active: boolean;
}

export interface VoiceSetting {
    id: string;
    key: string;
    value: string;
    description?: string;
}

export interface PbxConfig {
    id: string;
    host?: string;
    port?: number;
    username?: string;
    use_tls?: boolean;
    is_active: boolean;
    last_sync_at?: string;
}

export const agentsApi = {
    mappings: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<AgentPbxMapping>>(`/agent-pbx-mappings/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    callLogs: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CallLog>>(`/call-logs/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    voiceSettings: () =>
        fetchApi<PaginatedList<VoiceSetting>>(`/voice-settings/`, { plane: 'tenant' }).then(r => asList(r)),
    voiceTemplates: () =>
        fetchApi<PaginatedList<VoiceTemplate>>(`/voice-templates/`, { plane: 'tenant' }).then(r => asList(r)),
    pbxConfig: () =>
        fetchApi<PbxConfig>(`/mikopbx-config/me/`, { plane: 'tenant' }),
};
