# Sheba ISP Secure API Application & API Key Architecture Guide

## 1. Architectural Overview

Sheba ISP ERP provides a secure, multi-tenant External ISP Frontend Application and API Key architecture.
Each ISP tenant can have registered frontend applications (e.g. Next.js Web Portals, Mobile Apps) issued high-entropy API keys by Super Admins through the Central Control Plane.

```
Central Control Plane (admin.shebafi.xyz)
        │
        ▼ (Superadmin provisions ISP and registers Application)
    ISP/Tenant (Tenant record + TenantDomain)
        │
        ▼ (External frontend holds SHEBA_API_URL + SHEBA_API_KEY)
External ISP Frontend (Next.js / React Native)
        │
        ▼ (Dual-Token: X-API-Key + Authorization: Token <staff_token>)
   Django /api/v1/
```

### The 8-Step Flow:
1. **Superadmin creates ISP** (`Tenant` record created via Central Control Plane).
2. **Superadmin creates Application** (`ApiApplication` registered for the tenant via `/api/v1/saas/applications/`).
3. **System generates API key** (High-entropy 256-bit random key, salted SHA-256 hash stored in DB).
4. **Secret is shown once** (Returned in `secret_key` field on creation response, never readable again).
5. **External frontend stores API URL + key** (In environment variables: `NEXT_PUBLIC_API_URL`, `SHEBA_API_KEY`).
6. **Staff user authenticates normally** (`POST /api/v1/auth/login/` with username/password, passing `X-API-Key`).
7. **Django derives tenant from trusted context/application** (`request.tenant = application.tenant`).
8. **Normal RBAC / object permissions apply** (Subsequent requests send `X-API-Key` + `Authorization: Token <key>`).

---

## 2. Core Security Invariants

An API key identifies the frontend application container and establishes trusted tenant context.

### What an API Key MUST NOT Do:
1. **MUST NOT bypass staff authentication**: An application API key without machine scopes cannot access tenant resources alone. Endpoints require an authenticated staff user.
2. **MUST NOT bypass RBAC**: The staff user's role and capability permissions (`can(request.user, request.tenant, ...)`) are strictly evaluated on every request.
3. **MUST NOT bypass object permissions**: Staff users cannot access or manipulate objects outside their own tenant (`obj.tenant_id == request.tenant.id`).
4. **MUST NOT select arbitrary `tenant_id`**: The active tenant is derived strictly and cryptographically from the application API key. Any `tenant_id` in request body, query params, or headers is ignored.
5. **MUST NOT access another tenant**: If a staff user belonging to Tenant B sends their auth token through Tenant A's application key, the request is rejected with `403 Forbidden` (`CROSS_TENANT_APPLICATION_ACCESS`).
6. **MUST NOT become a superadmin credential**: API keys and application contexts are strictly blocked from `/api/v1/saas/*` Central Control Plane endpoints.

---

## 3. Dual-Token Architecture

To ensure separation of application identity and staff user identity, Sheba ISP ERP uses a **Dual-Token pattern**:

| Header | Purpose | Example |
| :--- | :--- | :--- |
| `X-API-Key` | Identifies the Frontend Application & binds tenant context | `shb_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6` |
| `Authorization` | Identifies the Authenticated Staff User | `Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b` |

When both headers are present:
1. `TenantApiKeyAuthentication` validates the application key against stored SHA-256 hash and verifies active status.
2. It validates the staff user token against the auth token store.
3. It confirms that the staff user holds an active `StaffMembership` within `application.tenant`.
4. It attaches `request.tenant`, `request.application`, `request.membership`, and sets `request.user` to the staff `User`.
5. Standard DRF permissions and RBAC can inspect `request.user` and `request.membership` seamlessly.

---

## 4. Authentication & Header Conventions

Clients authenticate by providing the raw secret key in one of two supported HTTP headers:

### Option A: `X-API-Key` (Recommended for Dual-Token & BFF)
```http
GET /api/v1/customers/ HTTP/1.1
Host: api.shebafi.com
X-API-Key: shb_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6
Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b
Content-Type: application/json
```

### Option B: `Authorization: Api-Key` (Machine-to-Machine)
```http
GET /api/v1/customers/ HTTP/1.1
Host: api.shebafi.com
Authorization: Api-Key shb_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6
Content-Type: application/json
```

---

## 5. Control Plane Application Management Endpoints

Superadmins manage External Frontend Applications on the Central Control Plane (`admin.shebafi.xyz`):

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/saas/applications/` | List all registered applications across tenants (filterable by `?tenant=<uuid/slug>&status=<ACTIVE/REVOKED/SUSPENDED>`). |
| `POST` | `/api/v1/saas/applications/` | Register an application for an ISP tenant. Generates 256-bit API key and returns one-time `secret_key`. |
| `GET` | `/api/v1/saas/applications/{id}/` | Retrieve application metadata (safe `key_prefix`, permissions, rate limit, status). Never returns secret. |
| `POST` | `/api/v1/saas/applications/{id}/rotate/` | Rotates key: invalidates old key, generates new key, returns one-time `secret_key`. |
| `POST` | `/api/v1/saas/applications/{id}/suspend/` | Temporarily suspends application credentials without permanent revocation. |
| `POST` | `/api/v1/saas/applications/{id}/reactivate/` | Reactivates a suspended application. |
| `POST` | `/api/v1/saas/applications/{id}/revoke/` | Permanently revokes the application credentials. |

---

## 6. Permission Scopes Reference

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

## 7. API Response Codes & Error Handling

When authenticating via an API key, the ERP returns structured JSON error responses:

| HTTP Status | Error Code | Detail Message | Explanation / Resolution |
| :--- | :--- | :--- | :--- |
| `401 Unauthorized` | `INVALID_API_KEY` | `Invalid API key provided.` | The provided key does not match any active credential. |
| `401 Unauthorized` | `CREDENTIAL_REVOKED` | `API key has been revoked.` | Key was permanently revoked by a Super Admin. |
| `401 Unauthorized` | `CREDENTIAL_EXPIRED` | `API key has expired.` | Key exceeded its configured expiration date. |
| `401 Unauthorized` | `CREDENTIAL_SUSPENDED` | `API key is suspended.` | Key was temporarily deactivated. |
| `403 Forbidden` | `CROSS_TENANT_APPLICATION_ACCESS` | `Access denied: Staff user is not an active staff member of tenant...` | Cross-tenant token presented. |
| `403 Forbidden` | `CROSS_TENANT_LOGIN` | `Access denied: You are not an active staff member of tenant...` | Attempted login across tenant boundary. |
| `403 Forbidden` | `PERMISSION_DENIED` | `API key lacks required permission scope: <module>:<action>` | The key is active but lacks the necessary scope. |
| `403 Forbidden` | `CONTROL_PLANE_DENIED` | `Permission denied.` | API keys cannot access `/api/v1/saas/*` endpoints. |
| `403 Forbidden` | `TENANT_INACTIVE` | `ISP tenant "<name>" is suspended or inactive.` | The entire ISP organization has been deactivated. |

---

## 8. Implementation Examples

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

## 9. Key Rotation & Lifecycle Best Practices

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
