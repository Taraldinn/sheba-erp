'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { AuthState, AuthUser, AuthContextType, LoginCredentials, AuthError } from './auth-types';
import { TokenStorage } from './token-storage';
import { AuthService } from './auth-service';

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials, contextType?: AuthContextType, tenantId?: string) => Promise<AuthUser>;
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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setContextType = useCallback((newContext: AuthContextType) => {
    setContextState(newContext);
    TokenStorage.setStoredContextType(newContext);
  }, []);

  const handleUnauthorized = useCallback(() => {
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
    async (credentials: LoginCredentials, requestedContext?: AuthContextType, customTenantId?: string): Promise<AuthUser> => {
      setIsLoading(true);
      setError(null);

      const targetContext = requestedContext || contextType;
      const targetTenantId = customTenantId || tenantId || undefined;

      try {
        const response = await AuthService.login(credentials, targetContext, targetTenantId);

        // Store session tokens & context
        TokenStorage.setStoredToken(response.token, targetContext, response.user.tenant_id || targetTenantId);

        setUser(response.user);
        setToken(response.token);
        setContextState(targetContext);
        if (response.user.tenant_id) {
          setTenantIdState(response.user.tenant_id);
        }

        return response.user;
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
