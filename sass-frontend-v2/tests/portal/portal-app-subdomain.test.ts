import { describe, it, expect } from 'vitest';
import { resolvePortal } from '@/lib/portal/resolve-portal';

describe('Portal Resolution for app.shebafi.xyz', () => {
    it('maps app.shebafi.xyz and app.localhost to ORGANIZATION_APP', () => {
        expect(resolvePortal('app.shebafi.xyz').portal).toBe('ORGANIZATION_APP');
        expect(resolvePortal('app.localhost').portal).toBe('ORGANIZATION_APP');
    });
});
