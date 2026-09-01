# Mobile App API Integration & Laravel Sanctum Setup Guide

This guide details how to integrate your Android/iOS mobile apps with the Sheba-Fi billing system using the Laravel template endpoints and dynamic multi-tenant DB structure.

---

## 1. Authentication Architecture (Sanctum)

Since each tenant has a distinct database, **personal access tokens must reside in the tenant's database**, not the master database. 
The custom middleware (`TenantDetectionMiddleware`) resolves the correct tenant connection *before* Sanctum's auth guard attempts to validate the Bearer token.

### Sanctum Model Config
In `config/sanctum.php`, make sure the model configuration points to a model connected to your default database connection, which the tenant middleware dynamically changes at runtime:
```php
'models' => [
    'personal_access_token' => Laravel\Sanctum\PersonalAccessToken::class,
],
```

Ensure your `App\Models\Customer` model uses the `Laravel\Sanctum\HasApiTokens` trait:
```php
namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'users'; // maps to users table
}
```

---

## 2. API Endpoints Reference

### Base URL
Every request must specify the tenant context. This can be done via:
* **Subdomain**: `https://{tenant-subdomain}.yourdomain.com/api/v1/customer/...`
* **Custom Headers**: Pass `X-Tenant-ID: {subdomain}` with all requests.

### Endpoints List

| Action | Method | Path | Auth | Key Parameters |
|---|---|---|---|---|
| Login | `POST` | `/api/v1/customer/login` | None | `username` (mobile/user_id), `password` |
| Profile | `GET` | `/api/v1/customer/profile` | Bearer Token | - |
| Live Usage | `GET` | `/api/v1/customer/live-usage` | Bearer Token | - |
| Bill Status | `GET` | `/api/v1/customer/bill/status` | Bearer Token | - |
| Pay Bill | `POST` | `/api/v1/customer/payment/paybill` | Bearer Token | `gateway`, `amount`, `trxid`, `paid_at` |
| Payment History | `GET` | `/api/v1/customer/payment/history`| Bearer Token | - |
| Create Ticket | `POST` | `/api/v1/customer/ticket/create` | Bearer Token | `subject`, `message`, `category` |

---

## 3. Dynamic Database Routing in Middleware

The provided `TenantDetectionMiddleware.php` acts as the traffic controller:
1. It intercepts the HTTP request and reads the subdomain or the `X-Tenant-ID` header.
2. It fetches the database name, host, user, and password from the master database table `tenants`.
3. It dynamically rewrites Laravel's DB configuration array for the `tenant` connection:
   ```php
   Config::set('database.connections.tenant.database', $tenant->db_name);
   ```
4. It purges connections and calls `DB::reconnect('tenant')`, making it transparent for the rest of the application cycle.

---

## 4. Mobile App Client Best Practices

### A. Authorization Header
Once login is successful, store the `access_token` securely (e.g., in iOS Keychain or Android EncryptedSharedPreferences). In all subsequent HTTP calls, pass the token as a Bearer authorization header:
```http
Authorization: Bearer <access_token>
```

### B. Handling Suspended Tenants
If a tenant is suspended, the API will return HTTP status `403 Forbidden` with the code `TENANT_SUSPENDED`. The app should redirect the user to a global error screen.

### C. Rate Limiting
Endpoints are throttled to `60 requests per minute` by default. If your app exceeds this, it will receive HTTP status `429 Too Many Requests`. Implement exponential back-off retries on your API client to handle this elegantly.
