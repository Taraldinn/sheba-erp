/**
 * ISP Owner Dashboard — Impersonate child tenant admin.
 *
 * Issues a DRF auth token for the authoritative admin of a child
 * tenant and displays it alongside a one-click "use in API client"
 * helper. Audit is written on every call.
 */
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
    AlertCircle,
    ArrowLeft,
    CheckDone01,
    Copy01,
    Key01,
} from '@untitledui/icons';
import { ispAdminApi, IspAdminImpersonateResponse } from '@/api/client';
import { Button } from '@/components/base/buttons/button';

export function OwnerChildImpersonateScreen() {
    const { id = '' } = useParams<{ id: string }>();
    const [result, setResult] = useState<IspAdminImpersonateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [issuing, setIssuing] = useState(false);
    const [copied, setCopied] = useState(false);

    const issue = async () => {
        setIssuing(true);
        setError(null);
        try {
            const res = await ispAdminApi.impersonateChildTenant(id);
            setResult(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to issue token');
        } finally {
            setIssuing(false);
        }
    };

    useEffect(() => {
        // Auto-issue on mount so the screen always has a fresh token.
        issue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const copy = async () => {
        if (!result?.token) return;
        try {
            await navigator.clipboard.writeText(result.token);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // ignore — user can select manually
        }
    };

    return (
        <div className="px-4 py-6 lg:px-8">
            <Link
                to={`/admin/child-tenants/${id}`}
                className="inline-flex items-center gap-1 text-sm text-tertiary hover:text-primary"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to tenant
            </Link>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-primary">
                        Impersonate child admin
                    </h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Issue a fresh DRF auth token to operate the child tenant's core
                        app. Every call is logged.
                    </p>
                </div>
                <Button
                    color="primary"
                    size="md"
                    iconLeading={Key01}
                    onClick={issue}
                    isLoading={issuing}
                >
                    Re-issue token
                </Button>
            </div>

            {error ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            {result ? (
                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                        <h2 className="text-sm font-semibold text-primary">Token</h2>
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border-secondary bg-bg-secondary p-3">
                            <code className="flex-1 break-all font-mono text-xs">
                                {result.token}
                            </code>
                            <Button
                                size="sm"
                                color="tertiary"
                                iconLeading={copied ? CheckDone01 : Copy01}
                                onClick={copy}
                            >
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                        </div>
                        <p className="mt-2 text-xs text-amber-700">
                            Re-issuing logs an additional audit row. Cache and re-use.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                        <h2 className="text-sm font-semibold text-primary">Identity</h2>
                        <dl className="mt-3 space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <dt className="text-tertiary">Admin username</dt>
                                <dd className="font-medium text-primary">
                                    {result.admin_username}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between">
                                <dt className="text-tertiary">Tenant</dt>
                                <dd className="font-medium text-primary">
                                    {result.tenant_slug}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between">
                                <dt className="text-tertiary">Tenant ID</dt>
                                <dd className="font-mono text-xs text-primary">
                                    {result.tenant_id}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-border-secondary bg-bg-secondary p-5 text-sm text-tertiary">
                <p className="font-medium text-primary">How to use the token</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    <li>
                        Add the token as <code className="rounded bg-primary px-1.5 py-0.5 font-mono">Authorization: Token &lt;value&gt;</code> on
                        requests to the child tenant's core app.
                    </li>
                    <li>
                        Use the child tenant's primary domain (or its custom CNAME)
                        in the <code className="rounded bg-primary px-1.5 py-0.5 font-mono">Host</code> header.
                    </li>
                    <li>
                        To switch the active session in this UI, paste the token into
                        your local dev environment's <code className="rounded bg-primary px-1.5 py-0.5 font-mono">saas_tenant_token</code> storage key.
                    </li>
                </ul>
            </div>
        </div>
    );
}