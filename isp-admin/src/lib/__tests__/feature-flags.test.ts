/**
 * Smoke test for Tier 3E ``FeatureFlagContext``.
 *
 * Uses the workspace's standard ``node:test`` runner — mirrors
 * ``saas-api.test.ts``.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetCachedSnapshotForTests,
  readCachedSnapshot,
} from '../feature-flags/FeatureFlagContext';
import { FEATURE_KEYS } from '../feature-flags/feature-keys';

describe('feature-flags / FeatureFlagContext', () => {
  beforeEach(() => {
    __resetCachedSnapshotForTests();
  });

  it('exposes a typed feature-key registry', () => {
    assert.equal(FEATURE_KEYS.billingInvoices, 'billing.invoices');
    assert.equal(FEATURE_KEYS.ipPhoneEpbx, 'ip_phone.epbx');
    assert.equal(FEATURE_KEYS.networkVpnWireguard, 'network.vpn_wireguard');
    assert.equal(
      FEATURE_KEYS.analyticsComplianceExport,
      'analytics.compliance_export',
    );
  });

  it('starts with an empty, unloaded snapshot', () => {
    const snap = readCachedSnapshot();
    assert.equal(snap.loaded, false);
    assert.deepEqual(snap.flags, {});
    assert.equal(snap.tenant_slug, '');
  });
});
