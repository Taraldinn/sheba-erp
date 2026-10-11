'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { platformAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, StatusBadge, ErrorAlert, KpiCard } from '@/components/feedback';
import { toast } from 'sonner';
import { Play, RefreshCw, Cpu, CheckCircle2 } from 'lucide-react';

export default function JobsPage() {
    const [runningTask, setRunningTask] = useState<string | null>(null);

    const jobsQuery = useQuery({
        queryKey: ['platform-admin', 'jobs'],
        queryFn: () => platformAdminApi.getJobsSnapshot(),
    });

    const runMutation = useMutation({
        mutationFn: async (taskName: string) => {
            setRunningTask(taskName);
            return platformAdminApi.runJobAdHoc(taskName);
        },
        onSuccess: (data) => {
            toast.success(`Task dispatched successfully! Task ID: ${data.task_id}`);
            setRunningTask(null);
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to dispatch task. OWNER role required.');
            setRunningTask(null);
        },
    });

    const allowlist = jobsQuery.data?.allowlist || [];
    const tasks = jobsQuery.data?.tasks || [];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Background Jobs & Task Scheduler"
                description="Monitor registered Celery worker tasks and execute scheduled synchronization routines ad-hoc."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => jobsQuery.refetch()}
                        disabled={jobsQuery.isFetching}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${jobsQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh Workers
                    </Button>
                }
            />

            {jobsQuery.isError && (
                <ErrorAlert
                    title="Failed to query worker tasks"
                    message={String((jobsQuery.error as Error)?.message || jobsQuery.error)}
                />
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard
                    label="Registered Celery Tasks"
                    value={jobsQuery.data?.registered_count ?? 0}
                    subtext="Worker queue consumers active"
                />
                <KpiCard
                    label="Allowlisted Manual Routines"
                    value={allowlist.length}
                    subtext="Permitted for ad-hoc execution"
                />
                <KpiCard
                    label="Scheduler Status"
                    value="ACTIVE"
                    subtext="Beat daemon synchronizing"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-primary/20">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Play className="h-4 w-4 text-primary" />
                            Allowlisted Manual Executions
                        </CardTitle>
                        <CardDescription>
                            Safe routines configured for on-demand execution by Platform Owners.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {allowlist.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No allowlisted tasks found.</p>
                        ) : (
                            allowlist.map((taskName) => (
                                <div
                                    key={taskName}
                                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/10 transition-colors"
                                >
                                    <div className="space-y-0.5">
                                        <div className="font-mono text-xs font-semibold text-foreground">
                                            {taskName}
                                        </div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                            <span>Platform Owner Gated</span>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => runMutation.mutate(taskName)}
                                        disabled={runMutation.isPending && runningTask === taskName}
                                    >
                                        <Play className={`mr-1.5 h-3.5 w-3.5 ${runningTask === taskName ? 'animate-pulse' : ''}`} />
                                        {runningTask === taskName ? 'Dispatching...' : 'Run Now'}
                                    </Button>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-muted-foreground" />
                            All Discovered Celery Tasks
                        </CardTitle>
                        <CardDescription>
                            All registered tasks in the backend application runtime.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-2 font-mono text-xs">
                            {tasks.map((t) => (
                                <div key={t} className="p-2 rounded bg-muted/40 text-muted-foreground truncate hover:text-foreground">
                                    {t}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
