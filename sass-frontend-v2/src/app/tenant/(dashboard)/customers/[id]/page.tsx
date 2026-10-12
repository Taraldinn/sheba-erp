'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@/lib/query/native';
import { customerApi, subscriptionApi, invoiceApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert, CardSkeleton } from '@/components/feedback/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';


export default function CustomerDetail() {
    const { id } = useParams() as { id: string };
    const customer = useQuery({ queryKey: queryKeys.customers.detail(id), queryFn: () => customerApi.get(id) });
    const subs = useQuery({ queryKey: [...queryKeys.subscriptions.all(), 'by-customer', id], queryFn: () => subscriptionApi.list({ customer: id }) });
    const invoices = useQuery({ queryKey: [...queryKeys.invoices.all(), 'by-customer', id], queryFn: () => invoiceApi.list({ customer: id }) });

    if (customer.isLoading) return <CardSkeleton rows={6} />;
    if (customer.error) return <ErrorAlert title="Failed to load customer" error={customer.error} />;
    if (!customer.data) return null;
    const c = customer.data;

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link href="/tenant/customers" className="text-sm text-muted-foreground hover:underline">← Customers</Link>
                    <h1 className="mt-1 text-2xl font-semibold">{c.full_name}</h1>
                    <p className="text-sm text-muted-foreground">
                        {c.customer_code} · {c.mobile} · {c.pppoe_username}
                    </p>
                </div>
                <Badge>{c.status}</Badge>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <Row k="Email" v={c.email ?? '—'} />
                        <Row k="Address" v={c.address ?? '—'} />
                        <Row k="Area" v={c.area_zone ?? '—'} />
                        <Row k="Connection" v={c.connection_type ?? '—'} />
                        <Row k="Package" v={c.package_name ?? c.package ?? '—'} />
                        <Row k="Router" v={c.router_name ?? c.router ?? '—'} />
                        <Row k="Monthly bill" v={String(c.monthly_bill ?? '—')} />
                        <Row k="Due" v={String(c.due_amount ?? '—')} />
                        <Row k="Advance" v={String(c.advance_amount ?? '—')} />
                        <Row k="Created" v={c.created_at} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader>
                    <CardContent>
                        {subs.data && subs.data.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                                {subs.data.map(s => (
                                    <li key={s.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                                        <span>{s.package_name ?? s.service_identifier}</span>
                                        <span className="text-muted-foreground">{s.status}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">No subscriptions.</p>
                        )}
                    </CardContent>
                </Card>
                <Card className="md:col-span-2">
                    <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
                    <CardContent>
                        {invoices.data && invoices.data.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                                {invoices.data.map(inv => (
                                    <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
                                        <span className="font-mono">{inv.invoice_no}</span>
                                        <span>{inv.billing_month}</span>
                                        <span>{String(inv.total_payable)}</span>
                                        <Badge variant={inv.status === 'PAID' ? 'default' : 'secondary'}>{inv.status}</Badge>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">No invoices.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function Row({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-mono">{v}</span>
        </div>
    );
}