import { PageHeader } from '@/components/feedback';

export default function SaasInvoicesPlaceholder() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Invoices"
                description="Manage global tenant invoices."
            />
            <div className="rounded-xl border border-border bg-card p-10 text-center">
                <p className="text-muted-foreground">This page is under construction.</p>
            </div>
        </div>
    );
}
