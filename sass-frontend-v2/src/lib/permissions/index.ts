export * from './permissions';
import { useAuth } from '../auth/auth-provider';
import { hasPermission, type Permission } from './permissions';

export function useCan(permission: Permission): boolean {
    const auth = useAuth();
    return hasPermission(auth.permissions, permission);
}

export function usePermissionSet() {
    const auth = useAuth();
    return auth.permissions;
}