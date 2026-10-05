import { useNavigate } from 'react-router';
import { Button } from '@/components/base/buttons/button';
import { usePlane } from '@/providers/plane-provider';
import { STORAGE_KEYS } from '@/api/client';

/**
 * Tiny switch widget that lets the user hop from central → tenant (or
 * back) when running on a dual-mode hostname. It does *not* clear the
 * current session — just navigates to the login screen of the other
 * plane, pre-selecting the right tab via localStorage override.
 */
export const PlaneSwap = () => {
    const plane = usePlane();
    const navigate = useNavigate();

    if (!plane.isDual) return null;

    const goTo = (target: 'central' | 'tenant') => {
        // Persist override so the destination login auto-selects the right tab
        // even before PlaneProvider reads it.
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('saas_plane_override', target);
        }
        // Drop just the *current* plane's token so the destination sees a
        // clean login (but don't drop the other plane's token — they may
        // legitimately be signed into both at once).
        const tokenKey = target === 'central' ? STORAGE_KEYS.tenantToken : STORAGE_KEYS.centralToken;
        if (typeof window !== 'undefined' && tokenKey) {
            // Keep both tokens; the login screen has its own redirect-if-signed-in logic.
            window.localStorage.removeItem(tokenKey);
        }
        navigate('/login');
    };

    const other = plane.plane === 'central' ? 'tenant' : 'central';
    return (
        <Button
            size="xs"
            color="tertiary"
            onClick={() => goTo(other)}
            className="!px-3"
        >
            {plane.plane === 'central' ? 'Switch to Tenant' : 'Switch to Central'}
        </Button>
    );
};