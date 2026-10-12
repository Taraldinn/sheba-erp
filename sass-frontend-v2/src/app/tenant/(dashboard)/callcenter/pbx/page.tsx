'use client';

import { useQuery } from '@/lib/query/native';
import { agentsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantPbxConfig() {
    const cfg = useQuery({ queryKey: queryKeys.agents.pbxConfig(), queryFn: () => agentsApi.pbxConfig() });

    return (
        <div className="space-y-6">
            <PageHeader
                title="MikoPBX configuration"
                description="Connection to your MikoPBX instance."
            />
            {cfg.error && <ErrorAlert title="Failed to load PBX config" error={cfg.error as Error} />}
            {cfg.data && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{cfg.data.host ?? 'No host configured'}</CardTitle>
                        <CardDescription>
                            Port {cfg.data.port ?? '—'} · {cfg.data.use_tls ? 'TLS' : 'plaintext'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <div className="text-xs text-muted-foreground">Status</div>
                            <StatusBadge status={cfg.data.is_active ? 'active' : 'inactive'} />
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Username</div>
                            <div className="font-mono">{cfg.data.username ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">Last sync</div>
                            <div>{cfg.data.last_sync_at ? new Date(cfg.data.last_sync_at).toLocaleString() : '—'}</div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
