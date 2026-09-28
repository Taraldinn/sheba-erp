// Regression tests for the global fetch interceptor in `lib/api.ts`.
//
// History
// -------
// The login flow used to "reset" after a successful sign-in. The root
// cause was the global ``setupFetchInterceptor()`` in ``lib/api.ts``:
// any 401 returned from a Sheba-API endpoint (other than
// ``/auth/login/``) cleared the user/token from localStorage and
// dispatched a ``sheba:unauthorized`` event. ``/features/me/`` (and
// similar background probes) legitimately 401 for reasons unrelated to
// the session, but the interceptor couldn't tell them apart from a
// real session expiration on ``/auth/me/``.
//
// The fix: the interceptor now only escalates 401s to
// ``sheba:unauthorized`` when the failing URL is a session-probe
// endpoint (``/auth/me/`` or ``/saas/auth/me/``). Other 401s are passed
// through silently so the auth state survives.
//
// We test against the source rather than spinning up a full DOM because
// the interceptor is wired up at module-load time and depends on a wide
// browser surface that the Node test runner does not provide.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_SOURCE = resolve(
  __dirname,
  '../api.ts',
);

const source = readFileSync(API_SOURCE, 'utf8');

test('fetch interceptor defines a session-auth URL helper', () => {
  // The helper must exist near the top of the file and must recognise
  // both ``/auth/me/`` and ``/saas/auth/me/`` (with or without a
  // trailing slash, and ignoring querystrings / fragments).
  assert.match(
    source,
    /function\s+isSessionAuthUrl\s*\(\s*url\s*:\s*string\s*\)/,
    'isSessionAuthUrl(url: string) helper must exist',
  );
  assert.match(
    source,
    /isSessionAuthUrl\(url\)/,
    'the interceptor must call isSessionAuthUrl() before clearing the session',
  );
});

test('fetch interceptor only escalates 401s from session-probe endpoints', () => {
  // The ``sheba:unauthorized`` dispatch must be inside the
  // ``isSessionProbe`` branch, NOT in the catch-all block. A 401 from
  // ``/features/me/`` (or any other non-session URL) must NOT clear
  // the user/token.
  const dispatchBlock = source.match(
    /TokenStorage\.clearStoredAuth\(\);\s*window\.dispatchEvent\([\s\S]{0,200}sheba:unauthorized[\s\S]{0,200}\)\s*;/,
  );
  assert.ok(dispatchBlock, 'expected to find the unauthorized dispatch block');
  // The dispatch must be preceded (within ~600 chars) by an
  // ``isSessionProbe`` guard so a 401 from a non-session endpoint
  // cannot reach it.
  const dispatchIndex = source.indexOf(dispatchBlock![0]);
  assert.ok(dispatchIndex > 0);
  const preceding = source.slice(Math.max(0, dispatchIndex - 600), dispatchIndex);
  assert.match(
    preceding,
    /isSessionProbe/,
    'unauthorized dispatch must be guarded by isSessionProbe',
  );
});

test('fetch interceptor does not clear auth on non-session 401s', () => {
  // The old code unconditionally called
  // ``TokenStorage.clearStoredAuth()`` on any 401. After the fix the
  // call must sit inside a guard that requires ``isSessionProbe`` to
  // be true. Concretely: when ``isSessionProbe`` is false the function
  // must ``return response`` early.
  assert.match(
    source,
    /if\s*\(\s*!isSessionProbe\s*\)\s*\{[\s\S]{0,80}return\s+response\s*;[\s\S]{0,80}\}/,
    'fetch interceptor must early-return on non-session 401s',
  );
});

test('fetch interceptor exempts /auth/login/ from clearing the session', () => {
  // The login endpoint itself must NEVER clear the session, even if it
  // 401s. The existing ``!url.includes('/auth/login/')`` guard is
  // still in place.
  assert.match(
    source,
    /!url\.includes\(['"]\/auth\/login\/['"]\)/,
    'login endpoint must remain exempt from session clearing',
  );
});

test('auth context adds a post-login grace period to handleUnauthorized', () => {
  // Even with the interceptor tightened, a stale 401 from
  // ``/auth/me/`` fired in the same tick as the login response could
  // still wipe the brand-new session. ``AuthProvider`` stamps a
  // performance.now() timestamp after a successful login and
  // ``handleUnauthorized`` ignores events within the next 5s.
  const ctxSource = readFileSync(
    resolve(__dirname, '../auth/auth-context.tsx'),
    'utf8',
  );
  assert.match(
    ctxSource,
    /lastLoginTimestampRef/,
    'AuthProvider must track the last-login timestamp',
  );
  assert.match(
    ctxSource,
    /5_000|5000/,
    'AuthProvider must apply a grace period (5 seconds) around the login event',
  );
});
