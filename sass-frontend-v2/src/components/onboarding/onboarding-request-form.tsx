'use client';

import { useState } from 'react';
import { Loader2, Building, Globe, Phone, Mail, MapPin, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { publicApi, type PublicOnboardingInput } from '@/lib/api/public';

export interface OnboardingRequestFormProps {
    defaultEmail?: string;
    defaultName?: string;
    onSuccess: (data: { organizationName: string; requestedSlug: string; plan: string }) => void;
}

const slugify = (s: string) =>
    s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);

export function OnboardingRequestForm({
    defaultEmail = '',
    defaultName = '',
    onSuccess,
}: OnboardingRequestFormProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [orgName, setOrgName] = useState('');
    const [slug, setSlug] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState(defaultEmail);
    const [address, setAddress] = useState('');
    const [plan, setPlan] = useState('Trial Plan');
    const [notes, setNotes] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const cleanSlug = slug || slugify(orgName);
        if (!orgName || !cleanSlug || !contactEmail) {
            setError('Please provide an organization name and contact email.');
            setLoading(false);
            return;
        }

        try {
            const payload: PublicOnboardingInput = {
                org_name: orgName,
                org_slug: cleanSlug,
                org_contact_phone: contactPhone || undefined,
                org_contact_email: contactEmail,
                org_address: address || undefined,
                tenant_name: `${orgName} ISP`,
                tenant_slug: cleanSlug,
                owner_email: contactEmail,
                owner_username: `${cleanSlug}_admin`,
                notes: notes || undefined,
            };

            await publicApi.startOnboarding(payload);
            onSuccess({
                organizationName: orgName,
                requestedSlug: cleanSlug,
                plan,
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to submit onboarding request.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl border-border/80 shadow-lg">
            <CardHeader className="space-y-1.5">
                <CardTitle className="text-xl font-bold tracking-tight">Register Your Organization</CardTitle>
                <CardDescription className="text-sm">
                    Fill up this form to request onboarding for your ISP organization and dedicated workspace.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="orgName" className="flex items-center gap-1.5 font-medium">
                                <Building className="size-3.5 text-muted-foreground" />
                                Organization Name *
                            </Label>
                            <Input
                                id="orgName"
                                placeholder="e.g. Dhaka Broadband Net"
                                value={orgName}
                                onChange={e => {
                                    setOrgName(e.target.value);
                                    if (!slug) setSlug(slugify(e.target.value));
                                }}
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="slug" className="flex items-center gap-1.5 font-medium">
                                <Globe className="size-3.5 text-muted-foreground" />
                                Subdomain Slug *
                            </Label>
                            <div className="flex items-center rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
                                <Input
                                    id="slug"
                                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                    placeholder="dhaka-net"
                                    value={slug}
                                    onChange={e => setSlug(slugify(e.target.value))}
                                    disabled={loading}
                                    required
                                />
                                <span className="bg-muted px-3 py-2 text-xs font-mono text-muted-foreground border-l border-border select-none">
                                    .shebafi.xyz
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="contactPhone" className="flex items-center gap-1.5 font-medium">
                                <Phone className="size-3.5 text-muted-foreground" />
                                Contact Phone
                            </Label>
                            <Input
                                id="contactPhone"
                                placeholder="+880 1700-000000"
                                value={contactPhone}
                                onChange={e => setContactPhone(e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="contactEmail" className="flex items-center gap-1.5 font-medium">
                                <Mail className="size-3.5 text-muted-foreground" />
                                Contact Email *
                            </Label>
                            <Input
                                id="contactEmail"
                                type="email"
                                placeholder="owner@ispprovider.com"
                                value={contactEmail}
                                onChange={e => setContactEmail(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="address" className="flex items-center gap-1.5 font-medium">
                            <MapPin className="size-3.5 text-muted-foreground" />
                            Business Address
                        </Label>
                        <Input
                            id="address"
                            placeholder="Street, City, Division"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <Button type="submit" className="w-full gap-2 font-semibold h-11" disabled={loading}>
                        {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                        Send Request to Onboard
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
