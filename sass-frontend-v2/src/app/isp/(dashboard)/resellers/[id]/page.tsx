'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { resellerApi, type ResellerCollectionPayload } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert, CardSkeleton } from '@/components/feedback/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/permissions';


export default function ResellerDetail() {
    const { id } = useParams() as { id: string };
    const canResell = useCan('reseller.purchase.create');
    const queryClient = useQueryClient();
    const wallet = useQuery({ queryKey: queryKeys.reseller.wallet(id), queryFn: () => resellerApi.wallet(id) });
    const credit = useQuery({ queryKey: queryKeys.reseller.credit(id), queryFn: () => resellerApi.credit(id) });
    const ledger = useQuery({ queryKey: queryKeys.reseller.ledger(id), queryFn: () => resellerApi.ledger(id) });
    const holds = useQuery({ queryKey: queryKeys.reseller.holds(id), queryFn: () => resellerApi.holds(id, 'PENDING') });
    const collections = useQuery({ queryKey: queryKeys.reseller.collections(id), queryFn: () => resellerApi.collections(id) });

    const [showCollect, setShowCollect] = useState(false);
    const [collectForm, setCollectForm] = useState<ResellerCollectionPayload>({ customer_id: '', amount: 0, method: 'cash' });
    const recordCollection = useMutation({
        mutationFn: () => resellerApi.recordCollection(id, collectForm),
        onSuccess: async () => {
            setShowCollect(false);
            await queryClient.invalidateQueries({ queryKey: queryKeys.reseller.collections(id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.reseller.wallet(id) });
        },
    });

    const releaseHold = useMutation({
        mutationFn: (holdId: string) => resellerApi.releaseHold(id, holdId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reseller.holds(id) }),
    });

    if (wallet.isLoading) return <CardSkeleton rows={6} />;
    if (wallet.error) return <ErrorAlert title="Failed to load wallet" error={wallet.error} />;

    return (
        <div className="space-y-6">
            <header>
                <Link href="/isp/resellers" className="text-sm text-muted-foreground hover:underline">← Resellers</Link>
                <h1 className="mt-1 text-2xl font-semibold">Reseller · {id.slice(0, 8)}</h1>
            </header>
            <div className="grid gap-4 md:grid-cols-3">
                <Kpi label="Wallet" value={wallet.data?.wallet_balance ?? '—'} sub={wallet.data?.currency} />
                <Kpi label="Pending holds" value={String(wallet.data?.pending_holds ?? '0')} />
                <Kpi label="Available credit" value={credit.data?.available_credit ?? '—'} sub={`of ${credit.data?.credit_limit ?? '—'}`} />
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Holds</CardTitle>
                </CardHeader>
                <CardContent>
                    {holds.data && holds.data.length > 0 ? (
                        <ul className="space-y-2 text-sm">
                            {holds.data.map(h => (
                                <li key={h.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                                    <div className="space-y-0.5">
                                        <div>{h.purpose}</div>
                                        <div className="text-xs text-muted-foreground">amount: {h.amount}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">{h.status}</Badge>
                                        {canResell && (
                                            <Button size="sm" variant="outline" disabled={releaseHold.isPending} onClick={() => releaseHold.mutate(h.id)}>
                                                Release
                                            </Button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-muted-foreground">No pending holds.</p>}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Ledger</CardTitle>
                </CardHeader>
                <CardContent>
                    {ledger.data && ledger.data.length > 0 ? (
                        <ul className="space-y-2 text-sm">
                            {ledger.data.map(e => (
                                <li key={e.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                                    <div className="space-y-0.5">
                                        <div>{e.description}</div>
                                        <div className="text-xs text-muted-foreground">{e.created_at}</div>
                                    </div>
                                    <span className="font-mono">{e.entry_type === 'CREDIT' ? '+' : '−'}{e.amount}</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-muted-foreground">No ledger entries.</p>}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Collections</CardTitle>
                        {canResell && <Button size="sm" onClick={() => setShowCollect(true)}>Record collection</Button>}
                    </div>
                </CardHeader>
                <CardContent>
                    {collections.data && collections.data.length > 0 ? (
                        <ul className="space-y-2 text-sm">
                            {collections.data.map(c => (
                                <li key={c.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                                    <div>
                                        <div>{c.customer_name ?? c.customer}</div>
                                        <div className="text-xs text-muted-foreground">{c.method} · {c.reference ?? '—'}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono">{c.amount}</span>
                                        <Badge variant="secondary">{c.status}</Badge>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-muted-foreground">No collections recorded.</p>}
                </CardContent>
            </Card>
            <Dialog open={showCollect} onOpenChange={setShowCollect}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Record collection</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Customer ID</Label>
                            <Input value={collectForm.customer_id} onChange={e => setCollectForm(f => ({ ...f, customer_id: e.target.value }))} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Amount</Label>
                            <Input type="number" value={String(collectForm.amount)} onChange={e => setCollectForm(f => ({ ...f, amount: Number(e.target.value) }))} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Method</Label>
                            <Select value={collectForm.method} onValueChange={v => setCollectForm(f => ({ ...f, method: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="bkash">bKash</SelectItem>
                                    <SelectItem value="nagad">Nagad</SelectItem>
                                    <SelectItem value="rocket">Rocket</SelectItem>
                                    <SelectItem value="bank">Bank</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Reference (optional)</Label>
                            <Input value={collectForm.reference ?? ''} onChange={e => setCollectForm(f => ({ ...f, reference: e.target.value }))} />
                        </div>
                    </div>
                    {recordCollection.error && <ErrorAlert title="Failed to record collection" error={recordCollection.error} />}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCollect(false)}>Cancel</Button>
                        <Button disabled={recordCollection.isPending || !collectForm.customer_id || !collectForm.amount} onClick={() => recordCollection.mutate()}>
                            {recordCollection.isPending ? 'Recording…' : 'Record'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <Card>
            <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}