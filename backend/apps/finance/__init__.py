"""
apps/finance — Financial Ledger & Billing Engine (Plan Phase E)

Models:
  BillingAccount     — per-customer billing record (balance, credit)
  InvoiceLine        — itemised lines on an invoice
  PaymentAllocation  — maps a payment transaction to an invoice
  LedgerEntry        — append-only financial journal
  Adjustment         — manual credit/debit adjustments
  IdempotencyKey     — deduplication for financial mutations (Plan Phase 34)
"""
default_app_config = 'apps.finance.apps.FinanceConfig'
