'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

export interface TrendPoint {
    month: string;
    collection: number;
    target: number;
}

export interface TrafficPoint {
    time: string;
    download: number;
    upload: number;
}

const collectionConfig = {
    collection: { label: 'Collected', color: 'var(--chart-1)' },
    target: { label: 'Target', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const trafficConfig = {
    download: { label: 'Download', color: 'var(--chart-1)' },
    upload: { label: 'Upload', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function CollectionChart({ data }: { data: TrendPoint[] }) {
    return (
        <ChartContainer config={collectionConfig} className="aspect-auto h-64 w-full">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barGap={4}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={v => compact.format(Number(v))} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="target" fill="var(--color-target)" radius={[4, 4, 0, 0]} fillOpacity={0.35} />
                <Bar dataKey="collection" fill="var(--color-collection)" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ChartContainer>
    );
}

export function TrafficChart({ data }: { data: TrafficPoint[] }) {
    return (
        <ChartContainer config={trafficConfig} className="aspect-auto h-64 w-full">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                    <linearGradient id="fillDownload" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-download)" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="var(--color-download)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillUpload" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-upload)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--color-upload)" stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={v => `${v}`} unit=" Mb" />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area type="monotone" dataKey="download" stroke="var(--color-download)" fill="url(#fillDownload)" strokeWidth={2} />
                <Area type="monotone" dataKey="upload" stroke="var(--color-upload)" fill="url(#fillUpload)" strokeWidth={2} />
            </AreaChart>
        </ChartContainer>
    );
}
