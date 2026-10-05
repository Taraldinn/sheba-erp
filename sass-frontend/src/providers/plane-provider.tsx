import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import {
    detectPlane,
    effectivePlane,
    readPlaneOverride,
    writePlaneOverride,
    type Plane,
    type PlaneOverride,
} from '@/lib/plane';

interface PlaneContextValue {
    /** Raw detection result from the hostname. */
    detection: Plane;
    /** Tenant slug extracted from a tenant hostname, or null. */
    tenantSlug: string | null;
    /** Whether the hostname exposes both planes (dual mode). */
    isDual: boolean;
    /** The currently effective plane (after applying user override). */
    plane: 'central' | 'tenant';
    /** User-chosen override on dual hostnames, or null. */
    override: PlaneOverride | null;
    /** Update the override (pass null to clear). */
    setOverride: (value: PlaneOverride | null) => void;
    /** Force-resolve against current URL + override (call after navigation). */
    refresh: () => void;
}

const PlaneContext = createContext<PlaneContextValue | null>(null);

interface PlaneProviderProps extends PropsWithChildren {
    /** Initial tenant slug (used when the host alone cannot determine it). */
    initialTenantSlug?: string | null;
}

export const PlaneProvider = ({ children, initialTenantSlug = null }: PlaneProviderProps) => {
    const [tick, setTick] = useState(0);

    const value = useMemo<PlaneContextValue>(() => {
        const detection = (() => {
            if (typeof window === 'undefined') return 'dual' as Plane;
            return detectPlane(window.location.hostname).plane;
        })();
        const override = readPlaneOverride();
        const effective = effectivePlane();
        return {
            detection,
            tenantSlug: effective.tenantSlug ?? initialTenantSlug,
            isDual: detection === 'dual',
            plane: effective.plane,
            override,
            setOverride: (v) => {
                writePlaneOverride(v);
                setTick((n) => n + 1);
            },
            refresh: () => setTick((n) => n + 1),
        };
        // tick is intentional so changes to override re-resolve
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick, initialTenantSlug]);

    const refresh = useCallback(() => setTick((n) => n + 1), []);

    return (
        <PlaneContext.Provider value={{ ...value, refresh }}>
            {children}
        </PlaneContext.Provider>
    );
};

export function usePlane(): PlaneContextValue {
    const ctx = useContext(PlaneContext);
    if (!ctx) {
        throw new Error('usePlane must be used inside <PlaneProvider>');
    }
    return ctx;
}