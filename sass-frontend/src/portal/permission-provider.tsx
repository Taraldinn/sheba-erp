import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useAuth } from './auth-provider';
import { usePortal } from './portal-provider';
import { hasPermission, canAccessModule, type Permission } from './permissions';
import type { ModuleItem } from './module-registry';

export interface PermissionContextValue {
    permissions: Set<string>;
    can: (permission: Permission) => boolean;
    hasPermission: (permission: Permission) => boolean;
    canAccessModule: (module: ModuleItem) => boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
    const auth = useAuth();
    const portal = usePortal();

    const permissions = auth.permissions;

    const canCheck = useCallback(
        (permission: Permission): boolean => {
            return hasPermission(permissions, permission);
        },
        [permissions]
    );

    const canAccessModuleCheck = useCallback(
        (module: ModuleItem): boolean => {
            return canAccessModule(
                module,
                portal.portal,
                permissions,
                auth.role,
                undefined
            );
        },
        [permissions, portal.portal, auth.role]
    );

    const value = useMemo<PermissionContextValue>(
        () => ({
            permissions,
            can: canCheck,
            hasPermission: canCheck,
            canAccessModule: canAccessModuleCheck,
        }),
        [permissions, canCheck, canAccessModuleCheck]
    );

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextValue {
    const ctx = useContext(PermissionContext);
    if (!ctx) {
        throw new Error('usePermissions must be used within a <PermissionProvider>');
    }
    return ctx;
}
