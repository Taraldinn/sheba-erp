import { type PropsWithChildren } from 'react';
import { Link } from 'react-router';
import { Stepper } from './stepper';
import type { Tenant } from '@/api/types';

interface WizardShellProps extends PropsWithChildren {
    slug: string;
    tenant: Tenant | null;
    currentStep: number;
    onStepChange?: (index: number) => void;
    /** Hide the footer nav (e.g. on the welcome splash before wizard starts). */
    hideNav?: boolean;
}

export const WizardShell = ({
    slug,
    tenant,
    currentStep,
    onStepChange,
    hideNav,
    children,
}: WizardShellProps) => {
    return (
        <div className="min-h-screen bg-bg-primary text-primary">
            {/* Header */}
            <header className="border-b border-border-secondary bg-bg-primary">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                    <Link to={`/onboarding/${slug}`} className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fg-brand-primary text-white">
                            <span className="text-sm font-bold">SF</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold">ShebaFi Onboarding</span>
                            <span className="text-xs text-tertiary">
                                {tenant ? tenant.name : `tenant: ${slug}`}
                            </span>
                        </div>
                    </Link>
                    <Link
                        to={`/onboarding/${slug}`}
                        className="text-sm font-medium text-tertiary hover:text-secondary"
                    >
                        ← Back to welcome
                    </Link>
                </div>
            </header>

            {/* Body */}
            <main className="mx-auto max-w-5xl px-6 py-10">
                {!hideNav && (
                    <div className="mb-8">
                        <Stepper current={currentStep} onStepClick={onStepChange} />
                    </div>
                )}
                <div className="rounded-2xl border border-border-secondary bg-bg-primary shadow-sm">
                    {children}
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-border-secondary">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-xs text-tertiary">
                    <span>ShebaFi Platform · Onboarding Wizard</span>
                    <span>Need help? support@shebafi.xyz</span>
                </div>
            </footer>
        </div>
    );
};