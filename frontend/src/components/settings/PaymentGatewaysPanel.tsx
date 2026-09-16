'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PaymentGatewayConfig } from '@/lib/settings/settings-types';

interface PaymentGatewaysPanelProps {
  gateways: PaymentGatewayConfig[];
  onUpdateGateway: (provider: PaymentGatewayConfig['provider'], payload: Partial<PaymentGatewayConfig>) => void;
}

export function PaymentGatewaysPanel({
  gateways,
  onUpdateGateway,
}: PaymentGatewaysPanelProps) {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getGateway = (provider: PaymentGatewayConfig['provider']): PaymentGatewayConfig => {
    return (
      gateways.find((g) => g.provider === provider) || {
        provider,
        title: `${provider} Payment Gateway`,
        is_active: false,
        is_sandbox: false,
      }
    );
  };

  const bkash = getGateway('BKASH');
  const nagad = getGateway('NAGAD');
  const ssl = getGateway('SSLCOMMERZ');

  return (
    <div className="space-y-6">
      {/* bKash Payment Gateway */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-pink-600/15 text-pink-500 flex items-center justify-center font-bold text-xs">
                bKash
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-bold text-foreground">bKash Merchant PGW & Tokenized Checkout</CardTitle>
                  <Badge variant={bkash.is_active ? 'default' : 'outline'} className="text-[10px]">
                    {bkash.is_active ? 'ACTIVE' : 'DISABLED'}
                  </Badge>
                  {bkash.is_sandbox && (
                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                      SANDBOX
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Direct API checkout and 1-click tokenized recurring subscriptions for bKash.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active:</span>
              <input
                type="checkbox"
                checked={bkash.is_active}
                onChange={(e) => onUpdateGateway('BKASH', { is_active: e.target.checked })}
                className="w-4 h-4 rounded border-border text-pink-600 focus:ring-pink-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground">Sandbox Mode (Test Credentials)</span>
              <p className="text-[10px] text-muted-foreground">Enable to test API handshakes before going live with bKash.</p>
            </div>
            <input
              type="checkbox"
              checked={bkash.is_sandbox}
              onChange={(e) => onUpdateGateway('BKASH', { is_sandbox: e.target.checked })}
              className="w-4 h-4 rounded border-border text-amber-500 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">bKash App Key</label>
              <Input
                value={bkash.app_key || ''}
                onChange={(e) => onUpdateGateway('BKASH', { app_key: e.target.value })}
                placeholder="Enter App Key"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">bKash App Secret</label>
              <div className="relative">
                <Input
                  type={showSecrets.bkash_secret ? 'text' : 'password'}
                  value={bkash.app_secret || ''}
                  onChange={(e) => onUpdateGateway('BKASH', { app_secret: e.target.value })}
                  placeholder="Enter App Secret"
                  className="bg-background text-xs h-9 font-mono pr-9"
                />
                <button
                  type="button"
                  onClick={() => toggleSecret('bkash_secret')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecrets.bkash_secret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">API Username</label>
              <Input
                value={bkash.username || ''}
                onChange={(e) => onUpdateGateway('BKASH', { username: e.target.value })}
                placeholder="Merchant API username"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">API Password</label>
              <div className="relative">
                <Input
                  type={showSecrets.bkash_pass ? 'text' : 'password'}
                  value={bkash.password || ''}
                  onChange={(e) => onUpdateGateway('BKASH', { password: e.target.value })}
                  placeholder="Merchant API password"
                  className="bg-background text-xs h-9 font-mono pr-9"
                />
                <button
                  type="button"
                  onClick={() => toggleSecret('bkash_pass')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecrets.bkash_pass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nagad Payment Gateway */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-600/15 text-orange-500 flex items-center justify-center font-bold text-xs">
                Nagad
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-bold text-foreground">Nagad Direct Checkout</CardTitle>
                  <Badge variant={nagad.is_active ? 'default' : 'outline'} className="text-[10px]">
                    {nagad.is_active ? 'ACTIVE' : 'DISABLED'}
                  </Badge>
                  {nagad.is_sandbox && (
                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                      SANDBOX
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Post-paid and prepaid broadband collections via Nagad Public/Private Key PKI signatures.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active:</span>
              <input
                type="checkbox"
                checked={nagad.is_active}
                onChange={(e) => onUpdateGateway('NAGAD', { is_active: e.target.checked })}
                className="w-4 h-4 rounded border-border text-orange-600 focus:ring-orange-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground">Sandbox Mode (Test Environment)</span>
              <p className="text-[10px] text-muted-foreground">Connects to Nagad Sandbox PGW endpoints.</p>
            </div>
            <input
              type="checkbox"
              checked={nagad.is_sandbox}
              onChange={(e) => onUpdateGateway('NAGAD', { is_sandbox: e.target.checked })}
              className="w-4 h-4 rounded border-border text-amber-500 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Merchant ID / Account Number</label>
              <Input
                value={nagad.merchant_number || ''}
                onChange={(e) => onUpdateGateway('NAGAD', { merchant_number: e.target.value })}
                placeholder="e.g. 68000000000"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Registered Merchant Phone</label>
              <Input
                value={nagad.merchant_phone || ''}
                onChange={(e) => onUpdateGateway('NAGAD', { merchant_phone: e.target.value })}
                placeholder="017XXXXXXXX"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Nagad Public Key</label>
              <textarea
                rows={3}
                value={nagad.public_key || ''}
                onChange={(e) => onUpdateGateway('NAGAD', { public_key: e.target.value })}
                placeholder="-----BEGIN PUBLIC KEY-----"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">ISP Private Key</label>
              <textarea
                rows={3}
                value={nagad.private_key || ''}
                onChange={(e) => onUpdateGateway('NAGAD', { private_key: e.target.value })}
                placeholder="-----BEGIN PRIVATE KEY-----"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SSLCommerz Gateway */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600/15 text-blue-500 flex items-center justify-center font-bold text-xs">
                SSL
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-bold text-foreground">SSLCommerz Hosted Gateway</CardTitle>
                  <Badge variant={ssl.is_active ? 'default' : 'outline'} className="text-[10px]">
                    {ssl.is_active ? 'ACTIVE' : 'DISABLED'}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Accept Visa, Mastercard, AMEX, and Bangladeshi Internet Banking channels.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Active:</span>
              <input
                type="checkbox"
                checked={ssl.is_active}
                onChange={(e) => onUpdateGateway('SSLCOMMERZ', { is_active: e.target.checked })}
                className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground">Sandbox Mode (Test Store)</span>
              <p className="text-[10px] text-muted-foreground">Use test card numbers in sandbox sandbox.sslcommerz.com.</p>
            </div>
            <input
              type="checkbox"
              checked={ssl.is_sandbox}
              onChange={(e) => onUpdateGateway('SSLCOMMERZ', { is_sandbox: e.target.checked })}
              className="w-4 h-4 rounded border-border text-amber-500 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Store ID</label>
              <Input
                value={ssl.store_id || ''}
                onChange={(e) => onUpdateGateway('SSLCOMMERZ', { store_id: e.target.value })}
                placeholder="e.g. testbox"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Store Password</label>
              <div className="relative">
                <Input
                  type={showSecrets.ssl_pass ? 'text' : 'password'}
                  value={ssl.store_password || ''}
                  onChange={(e) => onUpdateGateway('SSLCOMMERZ', { store_password: e.target.value })}
                  placeholder="Enter Store Password"
                  className="bg-background text-xs h-9 font-mono pr-9"
                />
                <button
                  type="button"
                  onClick={() => toggleSecret('ssl_pass')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecrets.ssl_pass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
