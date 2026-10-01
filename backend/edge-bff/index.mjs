/**
 * Sheba Edge BFF — FuncHole Node Runtime Function Handler
 *
 * Responsibilities:
 * 1. Terminate edge requests for /api/v1/*
 * 2. Handle CORS preflight options
 * 3. Extract and normalize Session / Token credentials from cookies/headers
 * 4. Tag requests with distributed tracing ID (X-Request-ID)
 * 5. Proxy upstream to Django core REST engine
 */

export async function handler(input) {
  const method = (input.method || "GET").toUpperCase();
  const rawHeaders = input.headers || {};
  const cookies = input.cookies || {};
  const path = input.path || "/api/v1/";
  const reqId =
    (Array.isArray(rawHeaders["X-Request-ID"]) ? rawHeaders["X-Request-ID"][0] : rawHeaders["X-Request-ID"]) ||
    `shb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Tenant-ID, Idempotency-Key, X-Request-ID",
    "X-Request-ID": reqId,
    "X-Edge-BFF": "FuncHole-v1-Stable",
  };

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return {
      status: 204,
      body: {},
      headers: corsHeaders,
    };
  }

  // Health probe endpoint
  if (path === "/healthz" || path === "/api/healthz") {
    return {
      status: 200,
      body: {
        status: "ok",
        platform: "FuncHole Edge BFF",
        gateway: "fur2a7.funchole.dev",
        timestamp: new Date().toISOString(),
      },
      headers: corsHeaders,
    };
  }

  // Determine session token
  let authToken = null;
  const authHeader = rawHeaders["Authorization"] || rawHeaders["authorization"];
  if (authHeader) {
    authToken = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  } else if (cookies["sheba_session"]) {
    authToken = `Session ${cookies["sheba_session"]}`;
  } else if (cookies["sheba_saas_session_token"]) {
    authToken = `Session ${cookies["sheba_saas_session_token"]}`;
  }

  const upstreamBase = process.env.DJANGO_UPSTREAM_URL || "http://127.0.0.1:8000";
  const upstreamUrl = new URL(path, upstreamBase);

  // Copy query parameters if present
  if (input.query) {
    for (const [k, v] of Object.entries(input.query)) {
      if (v !== undefined && v !== null) {
        upstreamUrl.searchParams.set(k, String(v));
      }
    }
  }

  // Build forward headers
  const forwardHeaders = {
    Accept: "application/json",
    "X-Request-ID": reqId,
  };

  if (authToken) {
    forwardHeaders["Authorization"] = authToken;
  }

  const tenantHeader = rawHeaders["X-Tenant-ID"] || rawHeaders["x-tenant-id"];
  if (tenantHeader) {
    forwardHeaders["X-Tenant-ID"] = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
  }

  const idemKey = rawHeaders["Idempotency-Key"] || rawHeaders["idempotency-key"];
  if (idemKey) {
    forwardHeaders["Idempotency-Key"] = Array.isArray(idemKey) ? idemKey[0] : idemKey;
  }

  let requestBody = null;
  if (method !== "GET" && method !== "HEAD" && input.body) {
    forwardHeaders["Content-Type"] = "application/json";
    requestBody = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  }

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method,
      headers: forwardHeaders,
      body: requestBody,
    });

    let responseData = null;
    const contentType = upstreamRes.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseData = await upstreamRes.json().catch(() => ({}));
    } else {
      const text = await upstreamRes.text().catch(() => "");
      responseData = { raw: text };
    }

    return {
      status: upstreamRes.status,
      body: responseData,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    };
  } catch (err) {
    return {
      status: 502,
      body: {
        error: "Bad Gateway",
        message: "Unable to reach upstream Django service",
        detail: err.message,
        upstream: upstreamUrl.origin,
      },
      headers: corsHeaders,
    };
  }
}
