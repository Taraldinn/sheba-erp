# Final Release Smoke Test Checklist

Execute these verifications against the production staging environment prior to formal launch.

## 1. Authentication & Access
- [ ] Admin Login
- [ ] Client Login
- [ ] Tenant Login
- [ ] Staff Login
- [ ] Android API Login

## 2. Billing & Finance
- [ ] Payment Verification UI
- [ ] SMS Verification Parsing
- [ ] bKash/Nagad Webhook Receipt
- [ ] Duplicate Transaction Rejection (Attempt submitting same TRX twice)
- [ ] Client Recharge Processing
- [ ] Promise Date Logic (Extension without payment)
- [ ] Expire Date Logic & Auto-Disconnect

## 3. Network Integrations
- [ ] MikroTik API Connection
- [ ] OLT API Connection
- [ ] ONU Search & Diagnostics

## 4. Role-Based Access Control
- [ ] POP Manager Restrictions
- [ ] Branch Manager Restrictions
- [ ] Reseller Accounting (Balance Deduction validation)

## 5. Operations & Tools
- [ ] Ticket System (Create/Reply as Client and Staff)
- [ ] Backup Cron Execution
- [ ] Core Reports (Income/Expense/Activity)
- [ ] AJAX Action Buttons (Ensure `APP_DEBUG` disables warnings that break JSON)
- [ ] Form Submissions
