'use client';

import { useQuery } from '@tanstack/react-query';
import { companySettingApi, type CompanySetting } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function TenantSettings() {
    const list = useQuery({ queryKey: queryKeys.settings.list(), queryFn: () => companySettingApi.list() });
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Settings</h1>
                <p className="text-sm text-muted-foreground">Company settings and tenant configuration.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load settings" error={list.error} />}
            <Card>
                <CardHeader>
                    <CardTitle>Company settings</CardTitle>
                </CardHeader>
                <CardContent>
                    {list.data && list.data.length > 0 ? (
                        <ul className="space-y-2 text-sm">
                            {list.data.map((s: CompanySetting) => (
                                <li key={s.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                                    <span className="font-mono">{s.key}</span>
                                    <span className="text-muted-foreground">{s.value}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">No settings yet.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}