import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface PropertyItem {
    label: string;
    value: ReactNode;
    /** When true, span the full width. */
    full?: boolean;
    monospace?: boolean;
}

export function PropertiesList({ items }: { items: PropertyItem[] }) {
    return (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {items.map((it, i) => (
                <div
                    key={i}
                    className={`flex flex-col gap-0.5 border-b border-dashed border-border/60 py-2 last:border-b-0 ${it.full ? 'sm:col-span-2' : ''}`}
                >
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{it.label}</dt>
                    <dd className={`text-sm ${it.monospace ? 'font-mono tabular-nums' : ''}`}>
                        {it.value ?? <span className="text-muted-foreground">—</span>}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export function SectionCard({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                </div>
                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}
