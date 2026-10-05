import type { ModuleItem } from './module-registry';

/**
 * Frontend UI presentation gating helpers.
 * Note: These are purely for UX display filtering; backend APIs perform
 * authoritative authorization and session tenant scoping.
 */

export function hasRole(userRole: string | undefined | null, allowedRoles?: string[]): boolean {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    if (!userRole) return false;
    const normalized = userRole.toLowerCase();
    return allowedRoles.some((r) => r.toLowerCase() === normalized || normalized === 'super_admin');
}

export function hasFeature(
    featureKey: string | undefined,
    flags?: Record<string, { enabled: boolean }>
): boolean {
    if (!featureKey) return true;
    if (!flags) return true; // Default allow if flags haven't loaded yet
    const flag = flags[featureKey];
    return flag ? Boolean(flag.enabled) : true;
}

export function canAccessModule(
    module: ModuleItem,
    userRole?: string | null,
    _flags?: Record<string, { enabled: boolean }>
): boolean {
    if (!hasRole(userRole, module.roles)) {
        return false;
    }
    // Any module-specific feature check can be added here
    return true;
}
