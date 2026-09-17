# Payment Gateway Credential Encryption & Security Guide

This document specifies the application-level encryption architecture for sensitive payment gateway and provider credentials in Sheba ISP ERP.

**Status:** `TESTED` / `PRODUCTION_VERIFIED`  
**Security Blocker Resolved:** `DEF-008` (Plaintext credentials in `PaymentGateway`)

---

## 1. Overview & Architecture

To prevent exposure of merchant credentials in database dumps, backups, error traces, or API queries, all sensitive attributes of `PaymentGateway` are encrypted at rest using AES-128-CBC + HMAC-SHA256 authenticated symmetric encryption via `cryptography.fernet.MultiFernet`.

### Encrypted Fields
The following fields in `PaymentGateway` are encrypted on write and transparently decrypted on model read:
- **bKash**: `app_key`, `app_secret`, `username`, `password`
- **Sandbox**: `sandbox_app_key`, `sandbox_app_secret`, `sandbox_username`, `sandbox_password`
- **Nagad**: `merchant_number`, `merchant_phone`, `public_key`, `private_key`
- **SSLCommerz**: `store_id`, `store_password`
- **Webhook Integration**: `webhook_secret`

### Ciphertext Format
Ciphertext tokens stored in the database always begin with the `enc:` prefix:
```
enc:gAAAAABn...[URL-safe base64 Fernet token containing IV, ciphertext, HMAC-SHA256]...
```
Legacy plaintext values (without `enc:`) are read as-is by `decrypt_str()` for backward compatibility and can be encrypted in place using the migration command.

---

## 2. Environment Configuration

### Setting the Encryption Key
The primary encryption key is supplied via the environment variable `FIELD_ENCRYPTION_KEY` (with fallback to `ENCRYPTION_KEY` or `SECRET_KEY` in development).

```bash
# Generate a cryptographically secure 32-byte URL-safe base64 Fernet key:
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

In `.env` or production orchestrator (Docker/Dokploy/Kubernetes):
```ini
FIELD_ENCRYPTION_KEY=dGhpcy1pcy1hLXNhbXBsZS0zMmJ5dGUtZmVybmV0LWtleS0=
```

> [!CAUTION]
> Never commit `FIELD_ENCRYPTION_KEY` to source control or store it in the database.
> If `FIELD_ENCRYPTION_KEY` is lost, all encrypted credentials become unrecoverable and must be re-entered.

---

## 3. Zero-Downtime Key Rotation Procedure

The encryption engine uses `cryptography.fernet.MultiFernet`, allowing seamless key rotation without taking the application offline.

### Step 1: Generate a New Primary Key
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Example output: NewKey_AbCdEf1234567890_xYz=
```

### Step 2: Configure Dual Keys
Set `FIELD_ENCRYPTION_KEY` with the **new primary key first**, followed by the **old key** separated by a comma:
```ini
FIELD_ENCRYPTION_KEY=NewKey_AbCdEf1234567890_xYz=,OldKey_9876543210_aBcDeF=
```
- **Reads**: `MultiFernet` tries `NewKey`. If it fails (data was encrypted with the old key), it seamlessly falls back to `OldKey`.
- **Writes**: Any newly created or updated credentials are automatically encrypted with `NewKey`.

### Step 3: Re-encrypt Existing Database Records
Execute the management command with the `--rotate` flag:
```bash
# Test rotation dry-run first:
python manage.py encrypt_payment_credentials --rotate --dry-run

# Run live re-encryption:
python manage.py encrypt_payment_credentials --rotate
```

### Step 4: Retire the Old Key
Once all records are re-encrypted with `NewKey`, remove the old key from the environment:
```ini
FIELD_ENCRYPTION_KEY=NewKey_AbCdEf1234567890_xYz=
```
Restart workers and web instances.

---

## 4. Migration Procedure for Existing Plaintext Databases

If an existing database contains plaintext credentials from prior versions:

1. **Deploy latest code and run database migrations:**
   ```bash
   python manage.py migrate
   ```
   Migration `0007_encrypt_payment_gateway_credentials` alters column lengths and automatically encrypts existing rows.

2. **Verify or re-run encryption via management command:**
   ```bash
   python manage.py encrypt_payment_credentials
   ```
   This command is completely idempotent:
   - Skips fields that are already encrypted (prefixed with `enc:`).
   - Encrypts unencrypted plaintext fields in place.

---

## 5. Security Invariants & Rules

1. **Serializers & API Responses**:
   - All sensitive credential fields on `PaymentGateway` are strictly `write_only`.
   - `PaymentGatewaySerializer.to_representation()` pops all sensitive keys.
   - API endpoints (`GET /api/v1/payment-gateways/` and `PATCH /api/v1/payment-gateways/<id>/`) return only masked metadata:
     - `is_configured`: Boolean indicator.
     - `has_app_key`, `has_app_secret`, `has_password`, `has_private_key`, `has_webhook_secret`, `has_store_password`: Booleans indicating presence.
     - `masked_app_key`, `masked_merchant_number`: Safe strings (e.g. `•••••••3344`).

2. **Celery Task Payloads**:
   - Celery tasks (such as `process_payment_event`) only accept entity UUIDs (`tenant_id`, `event_id`).
   - Credentials or configuration dictionaries must never be passed through Celery broker messages or Redis task queues.

3. **Application Logs**:
   - `decrypt_str()` catches decryption exceptions without printing the raw ciphertext or attempted secret.
   - Webhook signature logging never includes raw secret keys.

4. **Constant-Time Webhook Verification**:
   - Webhook signature checks compare HMAC-SHA256 digests in constant time (`apps.core.encryption.constant_time_compare` / `hmac.compare_digest`) to prevent timing side-channel attacks.

---

## 6. Backup and Restore Considerations

- **Key Decoupling**: Database backups (`pg_dump`) contain ciphertext (`enc:...`). A backup is useless without the corresponding `FIELD_ENCRYPTION_KEY`.
- **Key Archival**: Store environment encryption keys in an enterprise secret manager (e.g., Vault, AWS Secrets Manager, GCP Secret Manager) alongside database backup schedules.
- **Restoration**: When restoring a database backup to a staging or recovery environment, ensure the exact `FIELD_ENCRYPTION_KEY` active at the time of the backup is provided.

---

## 7. Incident Response: Compromised Encryption Key

If `FIELD_ENCRYPTION_KEY` is suspected of being compromised:

1. **Immediate Credential Revocation**:
   - Log in to provider portals (bKash Merchant Portal, Nagad Merchant Admin, SSLCommerz Dashboard) and revoke all existing `app_key`, `app_secret`, `private_key`, and `webhook_secret` values.
2. **Key Replacement**:
   - Generate a completely fresh `FIELD_ENCRYPTION_KEY`.
   - Update environment variables across all application instances.
3. **Re-enter Provider Credentials**:
   - Since the old key is compromised, do not rotate old ciphertexts. Issue new merchant credentials from payment providers and update each tenant's `PaymentGateway` via the ERP settings UI or API.
