'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Building2,
  Palette,
  DollarSign,
  Users,
  MessageSquare,
  Router as RouterIcon,
  CreditCard,
  PhoneCall,
  Save,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CompanySetting,
  PatchedCompanySetting,
  PaymentGatewayConfig,
  VoiceSettingConfig,
  SettingsTabKey,
} from '@/lib/settings/settings-types';
import { SettingsClient, ValidationErrorMap } from '@/lib/settings/settings-api';
import {
  CompanyProfileSettings,
  BrandingSettings,
  BillingConfigSettings,
  CustomerSettingsPanel,
  SmsSettingsPanel,
  NetworkSettingsPanel,
  PaymentGatewaysPanel,
  VoiceReminderPanel,
} from '@/components/settings';

const TABS: { id: SettingsTabKey; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'profile', label: 'Company Profile', icon: Building2, color: 'text-indigo-400' },
  { id: 'branding', label: 'Branding & Theme', icon: Palette, color: 'text-pink-400' },
  { id: 'billing', label: 'Billing & Expiry', icon: DollarSign, color: 'text-emerald-400' },
  { id: 'customers', label: 'Customer Defaults', icon: Users, color: 'text-cyan-400' },
  { id: 'sms', label: 'SMS & Templates', icon: MessageSquare, color: 'text-amber-400' },
  { id: 'network', label: 'Network & MikroTik', icon: RouterIcon, color: 'text-blue-400' },
  { id: 'gateways', label: 'Payment Gateways', icon: CreditCard, color: 'text-violet-400' },
  { id: 'voice', label: 'Voice Reminders', icon: PhoneCall, color: 'text-purple-400' },
];

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get('tab') as SettingsTabKey) || 'profile';

  const activeTab: SettingsTabKey = TABS.some((t) => t.id === tabParam) ? tabParam : 'profile';
  const [settings, setSettings] = useState<CompanySetting | null>(null);
  const [gateways, setGateways] = useState<PaymentGatewayConfig[]>([]);
  const [voice, setVoice] = useState<VoiceSettingConfig | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrorMap>({});

  const setTab = (newTab: SettingsTabKey) => {
    router.replace(`/settings?tab=${newTab}`, { scroll: false });
  };

  const loadSettingsData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setPageError(null);
    try {
      const [fetchedSettings, fetchedGateways, fetchedVoice] = await Promise.all([
        SettingsClient.getSettings(forceRefresh),
        SettingsClient.getPaymentGateways(),
        SettingsClient.getVoiceSettings(),
      ]);
      setSettings(fetchedSettings);
      setGateways(fetchedGateways);
      setVoice(fetchedVoice);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to load tenant configuration.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSettingsData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSettingsData]);

  // Handle local state changes
  const handleSettingsChange = (patch: Partial<CompanySetting>) => {
    if (!settings) return;
    setSettings((prev) => (prev ? { ...prev, ...patch } : null));
    setSavedSuccess(false);

    // Clear validation errors on edited fields
    const fieldKeys = Object.keys(patch);
    if (fieldKeys.length > 0) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        fieldKeys.forEach((k) => delete next[k]);
        return next;
      });
    }
  };

  // Safe optimistic update for toggles with automatic rollback on rejection
  const handleOptimisticToggle = async (field: keyof CompanySetting, value: boolean) => {
    if (!settings) return;
    const previous = settings[field];
    // Apply optimistic update immediately
    setSettings((prev) => (prev ? { ...prev, [field]: value } : null));

    try {
      const patch = { [field]: value } as PatchedCompanySetting;
      await SettingsClient.updateSettings(settings.id, patch);
    } catch (err: unknown) {
      // Rollback to previous value
      setSettings((prev) => (prev ? { ...prev, [field]: previous } : null));
      setPageError(
        `Failed to save toggle: ${err instanceof Error ? err.message : 'Network error'}`
      );
    }
  };

  // Gateway updates
  const handleUpdateGateway = async (
    provider: PaymentGatewayConfig['provider'],
    payload: Partial<PaymentGatewayConfig>
  ) => {
    const existing = gateways.find((g) => g.provider === provider);
    try {
      if (existing && existing.id) {
        const updated = await SettingsClient.updatePaymentGateway(existing.id, payload);
        setGateways((prev) => prev.map((g) => (g.provider === provider ? updated : g)));
      } else {
        const created = await SettingsClient.createPaymentGateway({
          provider,
          title: `${provider} Payment Gateway`,
          ...payload,
        });
        setGateways((prev) => [...prev.filter((g) => g.provider !== provider), created]);
      }
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to update payment gateway.');
    }
  };

  // Save all settings explicitly
  const handleSaveAll = async () => {
    if (!settings) return;

    // Run client-side validation
    const errors = SettingsClient.validate(settings);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setPageError('Please correct the validation errors marked in red.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = { ...settings };
      const id = payload.id;
      delete (payload as Partial<CompanySetting>).id;
      delete (payload as Partial<CompanySetting>).tenant;
      delete (payload as Partial<CompanySetting>).updated_at;
      const updated = await SettingsClient.updateSettings(id, payload);
      setSettings(updated);

      // Also persist voice settings if modified
      if (voice && voice.id) {
        await SettingsClient.updateVoiceSettings(voice.id, voice);
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !settings) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-72 bg-muted/60 animate-pulse rounded" />
          </div>
          <div className="h-9 w-28 bg-muted animate-pulse rounded" />
        </div>
        <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 w-28 bg-muted/50 animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-muted/20 border border-border animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            ISP Tenant Configuration & Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage company details, branding, billing automation, SMS gateways, and network defaults.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSettingsData(true)}
            disabled={isLoading || isSaving}
            className="text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={handleSaveAll}
            disabled={isSaving || !settings}
            className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : savedSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                Saved Successfully
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {pageError && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between text-xs text-rose-400 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{pageError}</span>
          </div>
          <button
            onClick={() => setPageError(null)}
            className="text-rose-400 hover:text-rose-300 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-1 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : tab.color}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel */}
      {settings && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {activeTab === 'profile' && (
            <CompanyProfileSettings
              settings={settings}
              onChange={handleSettingsChange}
              errors={validationErrors}
            />
          )}

          {activeTab === 'branding' && (
            <BrandingSettings
              settings={settings}
              onChange={handleSettingsChange}
              onOptimisticToggle={handleOptimisticToggle}
            />
          )}

          {activeTab === 'billing' && (
            <BillingConfigSettings
              settings={settings}
              onChange={handleSettingsChange}
              errors={validationErrors}
              onOptimisticToggle={handleOptimisticToggle}
            />
          )}

          {activeTab === 'customers' && (
            <CustomerSettingsPanel
              settings={settings}
              onChange={handleSettingsChange}
              onOptimisticToggle={handleOptimisticToggle}
            />
          )}

          {activeTab === 'sms' && (
            <SmsSettingsPanel
              settings={settings}
              onChange={handleSettingsChange}
              onOptimisticToggle={handleOptimisticToggle}
            />
          )}

          {activeTab === 'network' && (
            <NetworkSettingsPanel
              settings={settings}
              onChange={handleSettingsChange}
              errors={validationErrors}
              onOptimisticToggle={handleOptimisticToggle}
            />
          )}

          {activeTab === 'gateways' && (
            <PaymentGatewaysPanel
              gateways={gateways}
              onUpdateGateway={handleUpdateGateway}
            />
          )}

          {activeTab === 'voice' && (
            <VoiceReminderPanel
              voice={voice}
              onChange={(patch) => setVoice((prev) => (prev ? { ...prev, ...patch } : null))}
            />
          )}
        </div>
      )}

      {/* Sticky Bottom Actions Bar */}
      <div className="sticky bottom-4 z-40 bg-card/90 backdrop-blur-md border border-border p-3.5 rounded-2xl shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Tenant Context: Active Domain Environment</span>
          {settings?.updated_at && (
            <span className="hidden sm:inline text-muted-foreground font-mono">
              • Last synced: {new Date(settings.updated_at).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveAll}
            disabled={isSaving || !settings}
            className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Save All Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
          <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
