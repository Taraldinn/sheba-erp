import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import type { ReactNode } from 'react';

export function ErrorAlert({ title = 'Something went wrong', error }: { title?: string; error: unknown }) {
    const message =
        (error as { message?: string })?.message ||
        (typeof error === 'string' ? error : 'Unknown error');
    return (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <Card className="p-6">
            <Skeleton className="mb-3 h-5 w-1/3" />
            <div className="space-y-2">
                {Array.from({ length: rows }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                ))}
            </div>
        </Card>
    );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
            <h3 className="text-base font-semibold">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}