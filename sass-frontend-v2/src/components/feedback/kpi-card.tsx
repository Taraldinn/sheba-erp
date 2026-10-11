import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface KpiCardProps {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    subtext?: ReactNode;
    trend?: 'up' | 'down' | 'flat';
    /** When true, render the value in a destructive colour. */
    danger?: boolean;
    icon?: ReactNode;
    testId?: string;
}

/**
 * Compact KPI card for dashboards. The value can be a number, a MoneyText,
 * or a short string. The hint slot is for "% change vs last month" type
 * annotations and is rendered in muted text.
 */
export function KpiCard({ label, value, hint, subtext, danger, icon, testId }: KpiCardProps) {
    const hintText = hint ?? subtext;
    return (
        <Card data-testid={testId}>
            <CardContent className="flex flex-col gap-2 p-5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                    {icon && <span className="text-muted-foreground">{icon}</span>}
                </div>
                <div className={`text-2xl font-semibold tabular-nums ${danger ? 'text-destructive' : 'text-foreground'}`}>
                    {value}
                </div>
                {hintText && <div className="text-xs text-muted-foreground">{hintText}</div>}
            </CardContent>
        </Card>
    );
}
