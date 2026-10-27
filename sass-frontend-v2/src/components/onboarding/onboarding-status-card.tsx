'use client';

import Link from 'next/link';
import { Clock, CheckCircle2, XCircle, ArrowUpRight, RotateCcw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface OnboardingStatusCardProps {
    status: 'pending' | 'approved' | 'rejected';
    organizationName: string;
    requestedSlug: string;
    plan?: string;
    rejectionReason?: string;
    submittedAt?: string;
    onResubmit?: () => void;
    /** Open the approved workspace (exchanges the Neon login for a tenant session). */
    onLaunch?: () => void;
    launching?: boolean;
    launchError?: string | null;
}

export function OnboardingStatusCard({
    status,
    organizationName,
    requestedSlug,
    plan = 'Standard Plan',
    rejectionReason,
    submittedAt,
    onResubmit,
    onLaunch,
    launching = false,
    launchError,
}: OnboardingStatusCardProps) {
    return (
        <Card className="w-full max-w-2xl border-border/80 shadow-md">
            <CardHeader className="flex flex-row items-start justify-between pb-4">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-bold tracking-tight">{organizationName}</CardTitle>
                    <CardDescription className="text-sm">
                        Domain: <span className="font-mono text-foreground font-medium">{requestedSlug}.shebafi.xyz</span>
                    </CardDescription>
                </div>
                {status === 'pending' && (
                    <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 font-semibold">
                        <Clock className="size-3.5" />
                        Pending Review
                    </Badge>
                )}
                {status === 'approved' && (
                    <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 font-semibold">
                        <CheckCircle2 className="size-3.5" />
                        Approved & Active
                    </Badge>
                )}
                {status === 'rejected' && (
                    <Badge variant="outline" className="gap-1.5 border-destructive/30 bg-destructive/10 text-destructive px-3 py-1 font-semibold">
                        <XCircle className="size-3.5" />
                        Rejected
                    </Badge>
                )}
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/30 p-3.5 border border-border/40">
                    <div>
                        <span className="text-xs text-muted-foreground block">Subscription Tier</span>
                        <span className="font-semibold text-foreground">{plan}</span>
                    </div>
                    {submittedAt && (
                        <div>
                            <span className="text-xs text-muted-foreground block">Submitted On</span>
                            <span className="font-medium text-foreground">{submittedAt}</span>
                        </div>
                    )}
                </div>

                {status === 'pending' && (
                    <p className="text-muted-foreground text-xs leading-relaxed">
                        Your onboarding request is currently under review by our platform administration team. Once verified and approved, your workspace and dedicated database resources will be provisioned automatically.
                    </p>
                )}

                {status === 'approved' && (
                    <div className="space-y-2">
                        <p className="text-emerald-700 dark:text-emerald-300 font-medium text-xs">
                            Your organization workspace is active and ready for broadband operations.
                        </p>
                    </div>
                )}

                {status === 'rejected' && (
                    <div className="rounded-lg bg-destructive/10 p-3.5 text-xs text-destructive border border-destructive/20 space-y-1">
                        <span className="font-bold block">Review Feedback:</span>
                        <p>{rejectionReason || 'Your request was not approved. Please revise your details and try again.'}</p>
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-border/40 pt-4">
                {status === 'approved' ? (
                    <div className="flex flex-col gap-2">
                        <Button onClick={onLaunch} disabled={!onLaunch || launching} className="gap-2 font-semibold">
                            {launching ? <Loader2 className="size-4 animate-spin" /> : null}
                            Launch Workspace
                            <ArrowUpRight className="size-4" />
                        </Button>
                        {launchError && <span className="text-xs text-destructive">{launchError}</span>}
                    </div>
                ) : status === 'rejected' && onResubmit ? (
                    <Button variant="outline" onClick={onResubmit} className="gap-2 font-semibold">
                        <RotateCcw className="size-4" />
                        Edit & Resubmit Request
                    </Button>
                ) : (
                    <span className="text-xs text-muted-foreground">Status updates automatically.</span>
                )}
            </CardFooter>
        </Card>
    );
}
