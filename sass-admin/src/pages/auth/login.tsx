import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Mail01, Lock01, ShieldTick, ArrowRight } from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { UntitledLogo } from '@/components/foundations/logo/untitledui-logo';
import { Badge } from '@/components/base/badges/badges';

export function LoginScreen() {
  const [email, setEmail] = useState('admin@sheba.app');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token } = await saasApi.login({ email, password });
      localStorage.setItem('saas_token', token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = () => {
    setEmail('admin@sheba.app');
    setPassword('admin_secret_2026');
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-secondary_alt">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <UntitledLogo className="h-10 w-auto" />
        <div className="mt-4 flex items-center gap-2">
          <Badge color="brand" size="sm">
            SaaS Control Plane
          </Badge>
          <span className="text-xs text-tertiary">v2.4.0</span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-primary">
          Sign in to Admin Console
        </h2>
        <p className="mt-2 text-center text-sm text-tertiary">
          Central management for enterprise tenants, billing, and domains
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md bg-primary py-8 px-6 sm:px-10 shadow-lg rounded-2xl border border-secondary">
        <form className="space-y-5" onSubmit={handleLogin}>
          <Input
            label="Administrator Email"
            placeholder="admin@sheba.app"
            type="email"
            icon={Mail01}
            value={email}
            onChange={(val) => setEmail(val)}
            isRequired
          />

          <Input
            label="Password"
            placeholder="••••••••••••"
            type="password"
            icon={Lock01}
            value={password}
            onChange={(val) => setPassword(val)}
            isRequired
          />

          {error && (
            <div className="rounded-lg bg-error-primary_alt p-3 text-xs text-error-primary border border-error-subtle">
              {error}
            </div>
          )}

          <Button
            type="submit"
            color="primary"
            size="lg"
            className="w-full"
            isLoading={loading}
            iconTrailing={ArrowRight}
          >
            Authenticate & Enter
          </Button>

          {/* Demo Helper Button */}
          <div className="pt-2 border-t border-secondary">
            <button
              type="button"
              onClick={handleQuickDemo}
              className="w-full py-2 text-xs text-center text-brand-solid hover:underline font-medium"
            >
              Fill Demo Super-Admin Credentials
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 text-center text-xs text-quaternary flex items-center justify-center gap-2">
        <ShieldTick className="size-4 text-success-solid" />
        <span>Secured with End-to-End TLS & JWT Tenant Isolation</span>
      </div>
    </div>
  );
}
