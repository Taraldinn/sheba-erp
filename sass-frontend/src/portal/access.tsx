import { type PropsWithChildren, type ReactNode } from 'react';
import { useAuth, useCanAccess, useHasPermission, useHasRole } from './auth-provider';
import { type Portal, type UserRoleKey } from '@/auth/types';

/**
 * UI helpers for declarative permission / role / portal gating.
 *
 *   <Can permission="customer.create">
 *       <Button>Add customer</Button>
 *   </Can>
 *
 *   <RoleGate role={['ADMIN', 'BILLING']} fallback={<DisabledButton />}>
 *       ...
 *   </RoleGate>
 *
 *   <PortalGate portal="SUPER_ADMIN"><Dev>...</Dev></PortalGate>
 */

interface GateProps extends PropsWithChildren {
    fallback?: ReactNode;
}

// ── Can — permission gating ────────────────────────────────────────────────

interface CanProps extends GateProps {
    permission: string | string[];
    /** When true, *any* of the listed permissions is enough. Default false (all). */
    any?: boolean;
}

export const Can = ({ permission, any = false, fallback = null, children }: CanProps) => {
    const { permissions } = useAuth();
    const list = Array.isArray(permission) ? permission : [permission];
    const ok = permissions.has('*')
        || (any
            ? list.some((p) => permissions.has(p))
            : list.every((p) => permissions.has(p)));
    return <>{ok ? children : fallback}</>;
};

// ── RoleGate — role gating ────────────────────────────────────────────────

interface RoleGateProps extends GateProps {
    role: UserRoleKey | UserRoleKey[];
}

export const RoleGate = ({ role, fallback = null, children }: RoleGateProps) => {
    const list = Array.isArray(role) ? role : [role];
    const has = useHasRole(...list);
    return <>{has ? children : fallback}</>;
};

// ── PortalGate — portal access gating ─────────────────────────────────────

interface PortalGateProps extends GateProps {
    portal: Portal;
}

export const PortalGate = ({ portal, fallback = null, children }: PortalGateProps) => {
    const allowed = useCanAccess(portal);
    return <>{allowed ? children : fallback}</>;
};

// ── useCan hook variant (functional) ──────────────────────────────────────

/** Returns true if the user has the given permission(s). */
export function useCan(permission: string | string[], any = false): boolean {
    const { permissions } = useAuth();
    const list = Array.isArray(permission) ? permission : [permission];
    if (permissions.has('*')) return true;
    return any
        ? list.some((p) => permissions.has(p))
        : list.every((p) => permissions.has(p));
}