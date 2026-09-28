/**
 * Centralised feature-flag keys for the ISP ERP frontend.
 *
 * Keep in sync with ``apps/core/features.py`` on the backend — the
 * first failed check on the server side is the source of truth, but
 * the strings here are also passed to ``<IfFeature feature="...">``,
 * so a typo would silently hide UI without erroring.
 */
export const FEATURE_KEYS = {
  billingInvoices: 'billing.invoices',
  billingLateFees: 'billing.late_fees',
  billingDunning: 'billing.dunning',
  billingPayments: 'billing.payments',
  billingSmsLogs: 'billing.sms_logs',
  ipPhoneEpbx: 'ip_phone.epbx',
  ipPhoneClickToCall: 'ip_phone.click_to_call',
  networkVpnWireguard: 'network.vpn_wireguard',
  networkMikrotikHealth: 'network.mikrotik_health',
  customersPortal: 'customers.portal',
  analyticsComplianceExport: 'analytics.compliance_export',
  hrModule: 'hr.hr_module',
  resellersProgram: 'network.resellers',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];
