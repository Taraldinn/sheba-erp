import React from 'react';
import { Button } from '@/components/base/buttons/button';
import { AlertTriangle, Lock01, Shield03, RefreshCw01, HelpCircle, Building07 } from '@untitledui/icons';
import { Link } from 'react-router';

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
    return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-bg-secondary text-brand-primary shadow-sm animate-spin">
                <RefreshCw01 className="size-6 text-brand-primary" />
            </div>
            <p className="mt-4 text-sm font-medium text-text-secondary">{message}</p>
        </div>
    );
}

export function ErrorState({
    title = 'Something went wrong',
    message = 'An unexpected error occurred while loading this view.',
    onRetry,
}: {
    title?: string;
    message?: string;
    onRetry?: () => void;
}) {
    return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-utility-error-50 text-utility-error-600 shadow-sm">
                <AlertTriangle className="size-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-text-primary">{title}</h3>
            <p className="mt-1 max-w-md text-sm text-text-tertiary">{message}</p>
            {onRetry && (
                <div className="mt-6">
                    <Button color="secondary" onClick={onRetry}>
                        Try Again
                    </Button>
                </div>
            )}
        </div>
    );
}

export function EmptyState({
    title = 'No items found',
    message = 'Get started by creating your first entry.',
    actionLabel,
    onAction,
}: {
    title?: string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border-secondary p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-bg-secondary text-text-tertiary shadow-sm">
                <HelpCircle className="size-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-text-primary">{title}</h3>
            <p className="mt-1 max-w-sm text-sm text-text-tertiary">{message}</p>
            {actionLabel && onAction && (
                <div className="mt-5">
                    <Button color="primary" onClick={onAction}>
                        {actionLabel}
                    </Button>
                </div>
            )}
        </div>
    );
}

export function UnauthorizedState({
    message = 'You must be signed in to access this portal.',
}: {
    message?: string;
}) {
    return (
        <div className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-utility-brand-50 text-utility-brand-600 shadow-sm">
                <Lock01 className="size-7" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text-primary">Authentication Required</h2>
            <p className="mt-2 max-w-md text-sm text-text-tertiary">{message}</p>
            <div className="mt-6 flex gap-3">
                <Link to="/login">
                    <Button color="primary">Sign In</Button>
                </Link>
            </div>
        </div>
    );
}

export function ForbiddenState({
    portalName = 'this portal',
    message = 'Your account does not have sufficient permissions to view this resource.',
}: {
    portalName?: string;
    message?: string;
}) {
    return (
        <div className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-utility-warning-50 text-utility-warning-600 shadow-sm">
                <Shield03 className="size-7" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text-primary">Access Restricted</h2>
            <p className="mt-2 max-w-md text-sm text-text-tertiary">
                {message || `You do not have administrative clearance for ${portalName}.`}
            </p>
            <div className="mt-6 flex gap-3">
                <Link to="/login">
                    <Button color="secondary">Switch Account</Button>
                </Link>
            </div>
        </div>
    );
}

export function TenantNotFoundState({
    slug,
}: {
    slug?: string;
}) {
    return (
        <div className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-utility-gray-50 text-utility-gray-600 shadow-sm">
                <Building07 className="size-7" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-text-primary">ISP Tenant Not Found</h2>
            <p className="mt-2 max-w-md text-sm text-text-tertiary">
                {slug ? `No active ISP organization registered with identifier "${slug}".` : 'No tenant configured on this domain.'}
            </p>
            <div className="mt-6 flex gap-3">
                <Link to="/">
                    <Button color="secondary">Go to Homepage</Button>
                </Link>
                <Link to="/request">
                    <Button color="primary">Register Your ISP</Button>
                </Link>
            </div>
        </div>
    );
}
