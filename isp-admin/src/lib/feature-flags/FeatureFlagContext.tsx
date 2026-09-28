'use client';

/**
 * Feature-flag client + React context (Tier 3E).
 *
 * Reads the per-tenant feature snapshot from ``GET /api/v1/features/me/``
 * once and exposes a typed ``useFeatureFlag(key)`` hook + an
 * ``<IfFeature>`` guard component. The snapshot is cached in module
 * state for the page lifetime and refetched every 5 minutes so toggles
 * a SaaS admin just turned on take effect without a hard reload.
 *
 * Server-side rendering (Next.js) reads an empty snapshot — by design,
 * hidden behind the assumption that any feature-gated UI degrades
 * gracefully ("don't show the link") until the client hydrates and the
 * snapshot loads.
 *
 * The endpoint returns 403 for users without a tenant context (e.g.
 * central admins on ``admin.shebafi.xyz``). Those contexts call
 * ``useFeatureFlag`` and always get the registry defaults — admins on
 * the SaaS side see every feature.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ApiClient } from '@/lib/api';

export interface FeatureFlagEntry {
  enabled: boolean;
  is_override: boolean;
  config: Record<string, unknown>;
  paid?: boolean;
  label?: string;
  category?: string;
}

export interface FeatureFlagSnapshot {
  tenant_slug: string;
  tenant_id: string;
  flags: Record<string, FeatureFlagEntry>;
  /** ``true`` after the first fetch attempt (success or fail). */
  loaded: boolean;
  /** When the snapshot was last fetched; ISO-8601 string. */
  fetchedAt: string | null;
  /**
   * When truthy, the snapshot fetch failed; UI may degrade
   * gracefully or show a stale-data toast.
   */
  error?: string;
}

const EMPTY_SNAPSHOT: FeatureFlagSnapshot = {
  tenant_slug: '',
  tenant_id: '',
  flags: {},
  loaded: false,
  fetchedAt: null,
};

/** In-memory cache so HMR + multiple consumers share one fetch. */
let _cached: FeatureFlagSnapshot = EMPTY_SNAPSHOT;
let _inflight: Promise<FeatureFlagSnapshot> | null = null;
const REFRESH_MS = 5 * 60 * 1000;

export interface FeatureFlagContextValue {
  snapshot: FeatureFlagSnapshot;
  /** Force-refresh from the server. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<FeatureFlagContextValue | null>(null);

async function fetchSnapshot(): Promise<FeatureFlagSnapshot> {
  if (_inflight) return _inflight;
  // Skip the network call entirely when there's no auth token —
  // /features/me/ is auth-protected and would 401, polluting the
  // console during the unauthenticated /login render. The provider
  // re-runs the fetch after login because REFRESH_MS or a manual
  // ``refresh()`` call (mounted after the token lands) reloads.
  if (typeof window !== 'undefined' && !ApiClient.getToken()) {
    const empty: FeatureFlagSnapshot = {
      ..._cached,
      loaded: true,
      fetchedAt: _cached.fetchedAt,
    };
    _cached = empty;
    return empty;
  }
  _inflight = (async () => {
    try {
      const data = await ApiClient.getMyFeatureFlags();
      const snapshot: FeatureFlagSnapshot = {
        tenant_slug: data.tenant_slug || '',
        tenant_id: data.tenant_id || '',
        flags: data.flags || {},
        loaded: true,
        fetchedAt: new Date().toISOString(),
      };
      _cached = snapshot;
      return snapshot;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load feature flags.';
      // Keep whatever cached snapshot we had; only mark error if this
      // is the very first attempt.
      const snapshot: FeatureFlagSnapshot = {
        ..._cached,
        loaded: true,
        fetchedAt: _cached.fetchedAt,
        error: msg,
      };
      _cached = snapshot;
      return snapshot;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

/**
 * Provider component — wrap the application root (or any subtree)
 * with this so descendants can call ``useFeatureFlag``.
 */
export function FeatureFlagProvider({
  children,
  /** Disable live fetching (useful for unit tests). */
  disabled = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<FeatureFlagSnapshot>(_cached);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useMemo(
    () => async () => {
      if (disabled) return;
      const next = await fetchSnapshot();
      setSnapshot(next);
    },
    [disabled],
  );

  useEffect(() => {
    if (disabled) return;
    refresh();
    timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, disabled]);

  const value = useMemo(() => ({ snapshot, refresh }), [snapshot, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Read the snapshot — must be used inside a ``<FeatureFlagProvider>``.
 */
export function useFeatureSnapshot(): FeatureFlagSnapshot {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'useFeatureSnapshot must be used inside <FeatureFlagProvider>',
    );
  }
  return ctx.snapshot;
}

/**
 * Type-safe boolean helper — returns ``true`` only when the snapshot
 * has loaded AND the feature is enabled for the current tenant.
 *
 * On the server (and during the first paint before /features/me/
 * resolves) this returns ``false`` so server-rendered HTML never
 * reveals a feature the user can't access. After the snapshot loads
 * the value updates and the UI re-renders.
 */
export function useFeatureFlag(key: string): boolean {
  const snapshot = useFeatureSnapshot();
  if (!snapshot.loaded) return false;
  const entry = snapshot.flags[key];
  return !!entry?.enabled;
}

/**
 * Read the raw entry (config + override status) for a feature.
 */
export function useFeatureFlagEntry(key: string): FeatureFlagEntry | null {
  const snapshot = useFeatureSnapshot();
  return snapshot.flags[key] || null;
}

/**
 * Conditional render guard. Use around menu items, action buttons,
 * anything the SaaS admin can toggle off.
 *
 *   <IfFeature feature="ip_phone.epbx">
 *     <Link href="/callcenter">IP Phone</Link>
 *   </IfFeature>
 *
 * Renders an optional fallback while the snapshot is still loading.
 */
export function IfFeature({
  feature,
  fallback = null,
  children,
}: {
  feature: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const enabled = useFeatureFlag(feature);
  if (enabled) return <>{children}</>;
  return <>{fallback}</>;
}

/**
 * Imperative getter for non-React code (e.g. axios interceptors,
 * audit hooks). Synchronous — returns whatever's currently cached
 * or the empty defaults.
 */
export function readCachedSnapshot(): FeatureFlagSnapshot {
  return _cached;
}

/* istanbul ignore next: dev-only test helper */
export function __resetCachedSnapshotForTests() {
  _cached = EMPTY_SNAPSHOT;
  _inflight = null;
}
