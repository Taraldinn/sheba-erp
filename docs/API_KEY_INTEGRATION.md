# Sheba ISP Secret API Key & Backend-For-Frontend (BFF) Integration Guide

## 1. Architectural Overview

Sheba ISP ERP provides a secure, multi-tenant server-to-server integration architecture. Each ISP tenant can be issued dedicated, high-entropy secret API keys by Super Admins through the Central SaaS Control Plane. 

These keys allow each ISP to power:
- Custom branded subscriber portals
- Custom mobile applications (iOS / Android)
- Third-party billing, CRM, or accounting sync pipelines
- Dedicated Backend-For-Frontend (BFF) proxy services

```
┌─────────────────────────────────────────┐
│     Custom ISP Frontend (Browser / App) │
└────────────────────┬────────────────────┘
                     │ Session / JWT / Cookie (ISP user auth)
                     ▼
┌─────────────────────────────────────────┐
│   ISP Backend-For-Frontend (BFF) Server │
│   (Next.js Route Handler / FastAPI)     │
│   • Holds SHEBA_ISP_API_KEY in ENV      │
└────────────────────┬────────────────────┘
                     │ X-API-Key: shb_... (Server-to-Server)
                     ▼
┌─────────────────────────────────────────┐
│         Central Sheba ERP API           │
│   • TenantApiKeyAuthentication          │
│   • Constant-time HMAC verification     │
│   • Authoritative Tenant Resolution     │
│   • Granular Scope Enforcement          │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│   Isolated Domain Modules & Database    │
└─────────────────────────────────────────┘
```

---

## 2. Core Security Invariants

> [!CAUTION]
> **CRITICAL SECURITY RULE:** Never expose long-lived secret API keys (`shb_...`) in browser JavaScript, client-side bundles, or mobile app decompilable assets.

1. **Server-Side Only**: All API key requests must originate from a trusted backend server (BFF, webhook receiver, or cron worker) where the secret key is injected via environment variables.
2. **SHA-256 Storage**: Plaintext secret keys are never stored in the database. Only a cryptographically salted SHA-256 hash is persisted. The raw secret is revealed **exactly once** upon creation or rotation in the Super Admin panel.
3. **No Domain Spoofing Required**: The central ERP resolves the tenant partition authoritatively from the key itself. Clients do not need to forge `Host` headers or tenant subdomains.
4. **Isolated Tenant Boundary**: An API key bound to Tenant A cannot inspect, query, or mutate resources belonging to Tenant B. Cross-tenant queries return `404 Not Found`.
5. **Central Control Plane Immunity**: API keys are unconditionally forbidden from accessing `/api/v1/saas/*` control plane endpoints. Super Admin privileges require interactive root session tokens.

---

## 3. Authentication & Header Conventions

Clients authenticate by providing the raw secret key in one of two supported HTTP headers:

### Option A: `X-API-Key` (Recommended)
```http
GET /api/v1/customers/ HTTP/1.1
Host: api.shebafi.com
X-API-Key: shb_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6
Content-Type: application/json
```

### Option B: `Authorization: Api-Key`
```http
GET /api/v1/customers/ HTTP/1.1
Host: api.shebafi.com
Authorization: Api-Key shb_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6
Content-Type: application/json
```

---

## 4. Permission Scopes Reference

API keys can be restricted to specific granular permission scopes or granted wildcard (`*`) access:

| Scope | Category | Description | Safe Methods Only? |
| :--- | :--- | :--- | :--- |
| `*` | Super | Wildcard access to all tenant-scoped APIs | No |
| `customers:read` | Customers | Query subscriber lists, profiles, and statuses | Yes (`GET`, `HEAD`, `OPTIONS`) |
| `customers:write` | Customers | Create, edit, lock, unlock, and recharge customers | No (`POST`, `PUT`, `PATCH`, `DELETE`) |
| `billing:read` | Billing | View packages, offers, and billing summaries | Yes |
| `billing:write` | Billing | Manage packages, ledger entries, and accounts | No |
| `invoices:read` | Invoices | List and download subscriber invoices | Yes |
| `invoices:write` | Invoices | Generate, adjust, or cancel invoices | No |
| `payments:read` | Payments | Inspect transactions and gateway logs | Yes |
| `payments:write` | Payments | Record manual payments, verify gateway webhooks | No |
| `network:read` | Network | View router health, IP pools, and active sessions | Yes |
| `network:write` | Network | Terminate sessions, bind ONUs, sync secrets | No |
| `mikrotik:read` | Network | Query MikroTik telemetry and secrets | Yes |
| `mikrotik:write` | Network | Execute RouterOS provisioning commands | No |
| `olt:read` | Hardware | Monitor OLT PON ports and signal levels | Yes |
| `olt:write` | Hardware | Authorize ONUs, reset PON interfaces | No |
| `reports:read` | Analytics | Fetch revenue, subscriber, and usage reports | Yes |
| `settings:read` | Settings | Read tenant business and company profile | Yes |
| `settings:write` | Settings | Update notification templates and preferences | No |

---

## 5. API Response Codes & Error Handling

When authenticating via an API key, the ERP returns structured JSON error responses:

| HTTP Status | Error Code | Detail Message | Explanation / Resolution |
| :--- | :--- | :--- | :--- |
| `401 Unauthorized` | `INVALID_API_KEY` | `Invalid API key provided.` | The provided key does not match any active credential. |
| `401 Unauthorized` | `CREDENTIAL_REVOKED` | `API key has been revoked.` | Key was permanently revoked by a Super Admin. |
| `401 Unauthorized` | `CREDENTIAL_EXPIRED` | `API key has expired.` | Key exceeded its configured expiration date. |
| `401 Unauthorized` | `CREDENTIAL_SUSPENDED` | `API key is suspended.` | Key was temporarily deactivated. |
| `403 Forbidden` | `PERMISSION_DENIED` | `API key lacks required permission scope: <module>:<action>` | The key is active but lacks the necessary scope. |
| `403 Forbidden` | `CONTROL_PLANE_DENIED` | `Permission denied.` | API keys cannot access `/api/v1/saas/*` endpoints. |
| `403 Forbidden` | `TENANT_INACTIVE` | `ISP tenant "<name>" is suspended or inactive.` | The entire ISP organization has been deactivated. |

---

## 6. Implementation Examples

### Example 1: Next.js 14 / 15 Route Handler (BFF Proxy)

File: `app/api/subscribers/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

const CENTRAL_API_URL = process.env.SHEBA_CENTRAL_API_URL || 'https://api.shebafi.com/api/v1';
const ISP_API_KEY = process.env.SHEBA_ISP_API_KEY;

if (!ISP_API_KEY) {
  throw new Error('SHEBA_ISP_API_KEY is not defined in server environment.');
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const response = await fetch(`${CENTRAL_API_URL}/customers/${queryString}`, {
      method: 'GET',
      headers: {
        'X-API-Key': ISP_API_KEY,
        'Content-Type': 'application/json',
      },
      // Ensure Next.js does not cache private subscriber data
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal BFF gateway communication error' },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${CENTRAL_API_URL}/customers/`, {
      method: 'POST',
      headers: {
        'X-API-Key': ISP_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal BFF gateway communication error' },
      { status: 502 }
    );
  }
}
```

---

### Example 2: Python FastAPI BFF Service

File: `main.py`

```python
import os
import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

app = FastAPI(title="ISP Custom Frontend BFF Service")

CENTRAL_API_URL = os.getenv("SHEBA_CENTRAL_API_URL", "https://api.shebafi.com/api/v1")
ISP_API_KEY = os.getenv("SHEBA_ISP_API_KEY")

if not ISP_API_KEY:
    raise RuntimeError("SHEBA_ISP_API_KEY must be set in environment variables")


@app.get("/api/subscribers")
async def get_subscribers(request: Request):
    query_params = dict(request.query_params)
    async with httpx.AsyncClient(base_url=CENTRAL_API_URL) as client:
        try:
            resp = await client.get(
                "/customers/",
                params=query_params,
                headers={
                    "X-API-Key": ISP_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )
            return JSONResponse(content=resp.json(), status_code=resp.status_code)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"BFF Gateway error: {str(exc)}")


@app.post("/api/subscribers/{customer_id}/recharge")
async def recharge_subscriber(customer_id: str, request: Request):
    payload = await request.json()
    async with httpx.AsyncClient(base_url=CENTRAL_API_URL) as client:
        try:
            resp = await client.post(
                f"/customers/{customer_id}/recharge/",
                json=payload,
                headers={
                    "X-API-Key": ISP_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )
            return JSONResponse(content=resp.json(), status_code=resp.status_code)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"BFF Gateway error: {str(exc)}")
```

---

## 7. Key Rotation & Lifecycle Best Practices

1. **Zero-Downtime Rotation Procedure**:
   - Step 1: In the Super Admin Control Plane (`super-admin`), navigate to **ISP API Credentials**.
   - Step 2: Click **Issue Secret Key** to generate a secondary key for the ISP with identical permissions.
   - Step 3: Deploy the new key to your BFF staging and production environments.
   - Step 4: Verify traffic is successfully flowing under the new key.
   - Step 5: In Super Admin, revoke the retired key.
2. **Emergency Revocation**:
   - If an API key is suspected of leakage, click **Revoke** immediately in the Super Admin panel.
   - All server requests using the revoked key are rejected with `401 CREDENTIAL_REVOKED` in under 1ms.
3. **Suspension vs Revocation**:
   - **Suspend**: Temporarily pauses key access (e.g. while investigating billing discrepancy). Can be reactivated at any time.
   - **Revoke**: Irreversible permanent deactivation. Once revoked, a new credential must be generated.
