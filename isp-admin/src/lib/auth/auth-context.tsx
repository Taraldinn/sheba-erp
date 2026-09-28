'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AuthState, AuthUser, AuthContextType, LoginCredentials, AuthError } from './auth-types';
import { TokenStorage } from './token-storage';
import { AuthService } from './auth-service';

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials, contextType?: AuthContextType, tenantId?: string) => Promise<{ user: AuthUser; token: string; dashboard_url?: string }>;
  logout: (redirectUrl?: string) => Promise<void>;
  refreshSession: () => Promise<AuthUser | null>;
  clearError: () => void;
  setContextType: (context: AuthContextType) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
  initialContext?: AuthContextType;
}

export function AuthProvider({ children, initialContext }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Do not read browser storage during render. The server cannot access it, so
  // doing so would make the first client render differ from the SSR output.
  const [token, setToken] = useState<string | null>(null);
  const [contextType, setContextState] = useState<AuthContextType>(initialContext || 'tenant');
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AuthError | null>(null);
  // Performance.now() timestamp of the most recent successful login.
  // ``handleUnauthorized`` ignores ``sheba:unauthorized`` events that
  // arrive within a few seconds of this stamp, to absorb any 401s from
  // background requests that were already in flight before the
  // freshly-stored token was picked up by ``ApiClient``.
  const lastLoginTimestampRef = useRef<number>(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setContextType = useCallback((newContext: AuthContextType) => {
    setContextState(newContext);
    TokenStorage.setStoredContextType(newContext);
  }, []);

  const handleUnauthorized = useCallback(() => {
    // Absorb any session-expiry signal that fires within the first few
    // seconds after a successful login. Right after the user submits
    // the login form a couple of background requests are likely
    // already in flight (the FeatureFlagProvider's first refresh, the
    // notifications poller's first tick, etc.). If those requests
    // hit the backend BEFORE the freshly-stored token has been picked
    // up by ``ApiClient`` they will return 401, which would otherwise
    // wipe the brand-new session and bounce the operator back to
    // ``/login`` even though the sign-in actually succeeded.
    //
    // Five seconds is comfortably longer than any reasonable in-flight
    // network round trip but short enough that a genuinely expired
    // session still surfaces the "Your session has expired" toast in
    // a timely manner.
    if (typeof performance !== 'undefined') {
      const sinceLogin = performance.now() - lastLoginTimestampRef.current;
      if (lastLoginTimestampRef.current > 0 && sinceLogin < 5_000) {
        return;
      }
    }
    TokenStorage.clearStoredAuth();
    setUser(null);
    setToken(null);
    setTenantIdState(null);
    setError(
      new AuthError('Your session has expired. Please log in again.', 'SESSION_EXPIRED', 401)
    );
    setIsLoading(false);
  }, []);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    const currentToken = TokenStorage.getStoredToken();
    const currentContext = TokenStorage.getStoredContextType() || contextType;
    const currentTenant = TokenStorage.getStoredTenantId();

    if (!currentToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return null;
    }

    try {
      const activeUser = await AuthService.getCurrentUser(currentToken, currentContext, currentTenant || undefined);
      setUser(activeUser);
      setToken(currentToken);
      setContextState(currentContext);
      setTenantIdState(currentTenant);
      setError(null);
      return activeUser;
    } catch (err) {
      const authErr = err as AuthError;
      if (authErr?.status === 401 || authErr?.code === 'SESSION_EXPIRED' || authErr?.code === 'UNAUTHORIZED') {
        handleUnauthorized();
      } else {
        setError(authErr);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [contextType, handleUnauthorized]);

  // Load persisted authentication only after the initial, SSR-matching render.
  useEffect(() => {
    let isMounted = true;
    const storedToken = TokenStorage.getStoredToken();
    const persistedContext = TokenStorage.getExplicitStoredContextType();
    const storedContext: AuthContextType = (persistedContext !== null ? persistedContext : initialContext) ?? 'tenant';
    const storedTenantId = TokenStorage.getStoredTenantId();

    if (storedToken) {
      AuthService.getCurrentUser(storedToken, storedContext, storedTenantId || undefined)
        .then((activeUser) => {
          if (isMounted) {
            setToken(storedToken);
            setContextState(storedContext);
            setTenantIdState(storedTenantId);
            setUser(activeUser);
            setError(null);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            const authErr = err as AuthError;
            if (authErr?.status === 401 || authErr?.code === 'SESSION_EXPIRED') {
              handleUnauthorized();
            } else {
              setToken(storedToken);
              setContextState(storedContext);
              setTenantIdState(storedTenantId);
              setError(authErr);
              setIsLoading(false);
            }
          }
        });
    } else {
      setIsLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [initialContext, handleUnauthorized]);

  // Global unauthorized listener (from lib/api.ts or window events)
  useEffect(() => {
    const onUnauthorizedEvent = () => {
      handleUnauthorized();
    };

    window.addEventListener('sheba:unauthorized', onUnauthorizedEvent);

    // Cross-tab synchronization
    const unsubscribeSync = TokenStorage.onStorageChange((newToken, newContext, newTenantId) => {
      if (!newToken) {
        setUser(null);
        setToken(null);
        setTenantIdState(null);
      } else {
        setToken(newToken);
        if (newContext) setContextState(newContext);
        if (newTenantId !== undefined) setTenantIdState(newTenantId);
        refreshSession();
      }
    });

    return () => {
      window.removeEventListener('sheba:unauthorized', onUnauthorizedEvent);
      unsubscribeSync();
    };
  }, [handleUnauthorized, refreshSession]);

  const login = useCallback(
    async (
      credentials: LoginCredentials,
      requestedContext?: AuthContextType,
      customTenantId?: string,
    ): Promise<{
      user: AuthUser;
      token: string;
      dashboard_url?: string;
    }> => {
      setIsLoading(true);
      setError(null);

      const targetContext = requestedContext || contextType;
      const targetTenantId = customTenantId || tenantId || undefined;

      try {
        const response = await AuthService.login(credentials, targetContext, targetTenantId);

        // Store session tokens & context — namespaced per context so a
        // concurrent tenant-tab login cannot clobber this slot.
        TokenStorage.setStoredAuth(
          response.token,
          response.user,
          response.tenant ?? null,
          targetContext,
          {
            // Server returns session_id/expires_at on the reseller +
            // staff login shapes but not on the legacy SaaS login —
            // both are optional, so we just stash what we have.
            session_id: (response as any).session_id || '',
            expires_at: (response as any).session_expires_at || null,
          },
        );

        setUser(response.user);
        setToken(response.token);
        setContextState(targetContext);
        if (response.user.tenant_id) {
          setTenantIdState(response.user.tenant_id);
        }
        // Stamp the moment of a successful sign-in. ``handleUnauthorized``
        // ignores any ``sheba:unauthorized`` events that fire within a
        // few seconds of this timestamp so background requests that
        // were already in flight before the token landed in
        // ``TokenStorage`` cannot wipe the brand-new session and bounce
        // the operator back to ``/login``.
        lastLoginTimestampRef.current =
          typeof performance !== 'undefined' ? performance.now() : Date.now();

        // Return the user + token + the backend's recommended
        // ``dashboard_url`` (if any) so the calling page can
        // redirect straight to the role-specific dashboard rather
        // than every role landing on ``/``.
        return {
          user: response.user,
          token: response.token,
          dashboard_url: (response as any).dashboard_url,
        };
      } catch (err) {
        const authErr = err as AuthError;
        setError(authErr);
        throw authErr;
      } finally {
        setIsLoading(false);
      }
    },
    [contextType, tenantId]
  );

  const logout = useCallback(
    async (redirectUrl?: string) => {
      const activeToken = token || TokenStorage.getStoredToken();
      const activeContext = contextType || TokenStorage.getStoredContextType();

      // Immediately purge all local storage, cookies, and context state
      TokenStorage.clearStoredAuth();
      setUser(null);
      setToken(null);
      setTenantIdState(null);
      setError(null);
      setIsLoading(false);

      // Invalidate on backend asynchronously
      if (activeToken) {
        try {
          await AuthService.logout(activeToken, activeContext);
        } catch (err) {
          console.warn('Backend logout encountered error, local state cleaned:', err);
        }
      }

      if (redirectUrl && typeof window !== 'undefined') {
        window.location.href = redirectUrl;
      }
    },
    [token, contextType]
  );

  const contextValue: AuthContextValue = useMemo(
    () => ({
      user,
      token,
      contextType,
      tenantId,
      isAuthenticated: !!user && !!token,
      isLoading,
      error,
      login,
      logout,
      refreshSession,
      clearError,
      setContextType,
    }),
    [user, token, contextType, tenantId, isLoading, error, login, logout, refreshSession, clearError, setContextType]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
