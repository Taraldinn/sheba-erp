# Sheba-Fi Production Deployment & Security Checklist

This checklist defines the critical steps required to deploy the Sheba-Fi ISP Billing SaaS security upgrades safely to a live production environment. Follow each step sequentially to ensure zero downtime and maintain robust security isolation.

## 1. Environment & Config Setup
- [ ] **Configure `.env` File**: Ensure the root `.env` exists and contains correct keys:
  - `APP_ENV=production` (suppresses front-end PHP error output)
  - `APP_DEBUG=false` (disables debug logging and stack traces)
  - `MASTER_DB_HOST`, `MASTER_DB_NAME`, `MASTER_DB_USER`, `MASTER_DB_PASS` set properly
  - `API_SIGNATURE_VERIFICATION=true` (enforces strict signature validation on client-to-server calls)
- [ ] **Verify PHP settings**:
  - `display_errors` must resolve to `0` in production (controlled via `includes/config.php` dynamically, but good to check php.ini).
  - PHP error logging must be active and redirect output to `logs/php_error.log`.

## 2. Directory Permissions & Protection
- [ ] **Verify Directory Permissions**:
  - Web root directories and all `.php` files should be owned by `web-user` (or `www-data`) and have `644` (files) and `755` (folders) permissions.
  - Sensitive directories like `logs/` and `cache/` must be writable by the web server (e.g. php-fpm) but inaccessible via HTTP.
- [ ] **Verify `.htaccess` Protection**:
  - Ensure the root `.htaccess` is present and active (blocks `.env`, `composer.json`, and database dumps).
  - Ensure `cache/.htaccess`, `scratch/.htaccess`, and `tools/private/.htaccess` are present and restrict web access.
  - Verify directory listing is disabled (`Options -Indexes`).

## 3. Database Migrations & Constraints
- [ ] **Run Self-Healing Migrations**:
  - Load the main application once (or run `php includes/config.php` via CLI) to trigger auto-creation of missing tables (`tenant_wg` and `tenant_wg_subnets`).
  - The script will automatically clean up duplicate records in `payment_gateway_logs` (if any, by appending `-dup-<id>`) and add the `uq_gateway_trx` unique constraint.
- [ ] **Verify Unique Constraints**:
  - Verify that the `uq_gateway_trx` index exists on `payment_gateway_logs` (`SHOW INDEX FROM payment_gateway_logs`).
  - Verify that the `uq_request_trx` index exists on `payment_requests`.

## 4. Log Management & Credential Masking
- [ ] **Relocate Debug Utilities**:
  - Ensure any custom debugging scripts are moved to `tools/private` (which is blocked by htaccess) or deleted entirely from the production server.
- [ ] **Log Rotation Check**:
  - Check that the `logs/` directory contains rotated files (files exceeding 10MB will be automatically renamed to `.bak` by `safe_log`).
  - Verify that no sensitive plaintext data (passwords, MFS tokens) is written to logs.

## 5. Security & Session Integrity
- [ ] **Enforce Session Rules**:
  - Confirm that session settings in PHP are using HTTPOnly and Secure cookie flags (controlled dynamically by `includes/config.php`).
  - Validate that tenant subdomains are strictly isolated and that clients cannot authenticate into subdomains that mismatch their `client_tenant_id`.

## 6. Pre-Deployment Smoke Tests
- [ ] **Verify Syntax**:
  Run a PHP syntax check on all critical modified files:
  ```bash
  php -l includes/config.php
  php -l controllers/logic.php
  php -l controllers/payment_callback.php
  php -l controllers/client_controller.php
  php -l ajax/vpn_generate_mikrotik_script.php
  ```
- [ ] **MFS Webhook Testing**:
  - Verify bkash/nagad/rocket callbacks resolve successfully and that replay attacks (sending the same transaction ID twice) are blocked with a `403` or redirected immediately.
