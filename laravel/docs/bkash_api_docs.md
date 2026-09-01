# bKash Pay Bill Outbound API Integration Documentation

This document describes the API specifications for the bKash Pay Bill Integration Module in the Sheba-Fi ISP Billing system.

---

## Base Configuration & Authentication

All requests to the API are multi-tenant and must identify the tenant database context by passing the custom tenant header:
- Header: `X-Tenant-ID: {subdomain}` (or via tenant subdomain)

Additionally, bKash authentication is validated using:
- **`UserName`** and **`Password`** passed in the request body.
- **`X-Signature`** header containing a SHA-256 HMAC hash of the payload using the tenant API key.

---

## 1. Check Bill API

Checks the current due balance and customer profile details.

- **Method**: `POST`
- **Path**: `/api/v1/bkash/check-bill`

### Request Payload (JSON)
```json
{
  "UserName": "bkash_shebafi",
  "Password": "password_hash_or_string",
  "CustomerNo": "customer_user_id_102",
  "BillMonth": "062026"
}
```

### Successful Response (JSON - HTTP 200)
```json
{
  "ErrorCode": "200",
  "ErrorMsg": "Successful",
  "ConsumerName": "Ashikur Rahman",
  "BillMonth": "062026",
  "BillAmount": "1000.00",
  "BillDueDate": "20260630"
}
```

---

## 2. Pay Bill API

Processes client payments, extends the expiry date, reactivates router profiles, and logs audit events.

- **Method**: `POST`
- **Path**: `/api/v1/bkash/pay-bill`

### Request Payload (JSON)
```json
{
  "UserName": "bkash_shebafi",
  "Password": "password_hash_or_string",
  "CustomerNo": "customer_user_id_102",
  "Amount": 1000.00,
  "TrxId": "BKX98321045",
  "UserMobileNumber": "01712345678",
  "PayTime": "20260618174000"
}
```

### Successful Response (JSON - HTTP 200)
```json
{
  "ErrorCode": "200",
  "ErrorMsg": "Successful",
  "TotalAmount": "1000.00",
  "TrxId": "BKX98321045",
  "RefNumber": "INV-2026-00431"
}
```

---

## 3. Transaction Search API

Queries transaction details by transaction ID.

- **Method**: `POST`
- **Path**: `/api/v1/bkash/search-transaction`

### Request Payload (JSON)
```json
{
  "TrxId": "BKX98321045"
}
```

### Successful Response (JSON - HTTP 200)
```json
{
  "ErrorCode": "200",
  "ErrorMsg": "Successful",
  "TotalAmount": "1000.00",
  "TrxId": "BKX98321045",
  "MiddlewarePayTime": "20260618174000"
}
```

---

## Error Codes Reference

| ErrorCode | HTTP Code | Meaning |
|---|---|---|
| `200` | 200 | Success |
| `403` | 403 | Authentication Failed (invalid IP, signature, or credentials) |
| `404` | 404 | Data Not Found (customer or transaction not found) |
| `406` | 406 | Mandatory Field Missing (validation failed) |
| `435` | 422 / 435 | Data Mismatch / Reseller Insufficient Balance |
| `436` | 436 | Already Paid / Duplicate Transaction |
| `438` | 438 | Minimum Amount Not Paid (amount <= 0) |
