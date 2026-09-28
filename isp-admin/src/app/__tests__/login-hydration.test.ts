// Regression tests for the React hydration mismatch AND the
// post-login redirect policy in <LoginForm>.
//
// The hydration mismatch regression: the dev-mode banner and the
// tenant-locked chip both depend on `window.location.hostname`, which is
// not available during SSR. Computing those values synchronously during
// render yields HTML that disagrees between server and client.
//
// The dashboard-URL reading regression: the tenant login handler returns
// ``{ token, user, tenant }`` — the post-login dashboard URL lives on
// the user object (and may be snake or camel case depending on the
// serializer). Reading ``result.dashboard_url`` at the top level yielded
// ``undefined`` for tenant users, which left them on the login page
// with no obvious next step. The page now reads from the correct path.
//
// The redirect policy: after a successful sign-in the operator is
// auto-routed to their role-specific dashboard (so the sign-in is never
// perceived as silent). When they land on /login while already
// authenticated we also auto-redirect — keeping the login form
// rendered alongside a "Signed in as" banner was the original source
// of the "stuck on login page" complaint.
//
// We test against the source rather than rendering the page because
// the page depends on a wide React/HeroUI surface that is out of scope
// for the Node test runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOGIN_PAGE = resolve(
  __dirname,
  '../login/page.tsx',
);

const source = readFileSync(LOGIN_PAGE, 'utf8');

// ---- Hydration safety ---------------------------------------------------

test('login page initialises hostCtx via useState with null', () => {
  assert.match(
    source,
    /useState[\s\S]{0,40}parseTenantHost[\s\S]{0,80}\|\s*null/,
    'hostCtx should be initialised via useState, defaulting to null',
  );
});

test('login page does not compute hostCtx synchronously during render', () => {
  const inlineRenderAssignment =
    /^\s*const\s+hostCtx\s*=\s*typeof\s+window/m;
  assert.equal(
    inlineRenderAssignment.test(source),
    false,
    'hostCtx must not be assigned synchronously from typeof window inside the render body',
  );
});

test('login page resolves hostCtx inside a useEffect', () => {
  assert.match(
    source,
    /useEffect\(\(\)\s*=>\s*\{[\s\S]{0,200}parseTenantHost\(window\.location\.hostname\)/,
    'parseTenantHost(window.location.hostname) must be called inside a useEffect',
  );
});

test('login page dev-mode banner reads from the deferred state', () => {
  assert.match(
    source,
    /data-testid="dev-mode-banner"/,
    'dev-mode banner test id is preserved (selectors still work post-mount)',
  );
  // The banner must be gated on the deferred ``hostCtx?.isDevHost``
  // flag so it does not appear in the server-rendered HTML.
  assert.match(
    source,
    /hostCtx\?\.isDevHost/,
    'dev-mode banner must be gated on hostCtx?.isDevHost',
  );
});

test('login page does not render tenant-locked chip during SSR', () => {
  assert.match(
    source,
    /useState<string\s*\|\s*null>\(null\)[\s\S]{0,200}setLockedTenantSlug/,
    'lockedTenantSlug must be initialised via useState, defaulting to null',
  );
});

// ---- No auto-redirect after sign-in ------------------------------------

test('login page resolves the dashboard URL from the authed user object', () => {
  // The previous code read ``(result as any)?.dashboard_url`` but the
  // tenant login handler returns ``{ token, user, tenant }`` — the URL
  // lives on the user object, not at the top level. That bug made the
  // post-login success banner appear with NO "Continue" button, which
  // made the operator think they were stuck on the login page.
  const successPath = /await\s+login\([\s\S]{0,1200}\)/m;
  const match = source.match(successPath);
  assert.ok(match, 'expected to find the login() call block');
  const snippet = match?.[0] ?? '';
  assert.match(
    snippet,
    /result\?\.user\?\.dashboard_url/,
    'must read dashboard_url from result.user (snake_case) after login()',
  );
  assert.match(
    snippet,
    /result\?\.user\?\.dashboardUrl/,
    'must also try the camelCase dashboardUrl alias for back-compat',
  );
  // Top-level ``result.dashboard_url`` was the bug — guard against regression.
  assert.equal(
    /\(result as any\)\?\.dashboard_url/.test(snippet),
    false,
    'must not read dashboard_url at the top level of the login() result',
  );
});

test('login page auto-redirects after a successful sign-in', () => {
  // Earlier versions left the user on the login page after a successful
  // login which made it look like the sign-in had silently failed. The
  // operator now lands on the role-specific dashboard automatically,
  // with the success banner rendered briefly so the transition isn't
  // confusing.
  const successPath = /await\s+login\([\s\S]{0,2500}\)/m;
  const match = source.match(successPath);
  assert.ok(match, 'expected to find the login() call block');
  const snippet = match?.[0] ?? '';
  assert.match(
    snippet,
    /window\.location\.href\s*=/,
    'must set window.location.href after login() succeeds',
  );
  assert.match(
    snippet,
    /setSignedInDashboardUrl\(/,
    'must record the resolved dashboard URL in state for the success banner',
  );
  assert.match(
    snippet,
    /setPassword\(['"]['"]\)/,
    'must clear the password after a successful sign-in',
  );
});

test('login page auto-redirects when already authenticated at mount', () => {
  // If the user lands on /login while already authenticated, we DO
  // auto-redirect them to their dashboard. Rendering the login form
  // alongside a "Signed in as" banner was the original source of the
  // "stuck on login page" complaint.
  const mountEffect = source.match(
    /lands on \/login while already authenticated[\s\S]{0,1500}/,
  );
  assert.ok(mountEffect, 'expected already-authenticated block to exist');
  assert.match(
    mountEffect[0],
    /window\.location\.href\s*=/,
    'already-authenticated effect must redirect the operator to their dashboard',
  );
});

test('login page clears the password on failed authentication', () => {
  // The catch branch must clear the password (security) but leave the
  // username in place so the operator doesn't have to retype it.
  const catchBlock = source.match(
    /catch\s*\(\s*err[\s\S]{0,1500}\}\s*finally/,
  );
  assert.ok(catchBlock, 'expected to find the login catch/finally block');
  assert.match(
    catchBlock[0],
    /setPassword\(['"]['"]\)/,
    'failed login must clear the password',
  );
});

test('login page guards against double submissions', () => {
  // The submit handler must early-return if a request is already
  // in flight, even if the button somehow gets a click. Belt-and-braces
  // against the bug where the operator saw "Authenticating…" twice
  // and both requests went out.
  const exec = source.match(/const executeLogin[\s\S]{0,200}setSubmitting\(true\)/);
  assert.ok(exec, 'expected to find executeLogin');
  assert.match(
    exec[0],
    /if\s*\(\s*submitting\s*\)\s*return/,
    'executeLogin must early-return when already submitting',
  );
});

test('login page has a hard timeout on the submitting state', () => {
  // No matter what happens to the network, the form must leave
  // "Authenticating…" after a bounded time and return to an
  // actionable state.
  const timeout = source.match(/SUBMIT_TIMEOUT_MS\s*=\s*\d+/);
  assert.ok(timeout, 'SUBMIT_TIMEOUT_MS must be defined');
  assert.match(
    source,
    /clearTimeout\(timeoutRef\.current\)/,
    'login must clear its timeout on completion',
  );
});

test('login page hides the dev-mode banner in production', () => {
  // The amber "Development Mode" banner must never render in
  // production. It is gated by ``process.env.NODE_ENV !== 'production'``
  // AND by the host check, so a production build on localhost still
  // does not leak the banner.
  const guard = source.match(
    /hostCtx\?\.isDevHost[\s\S]{0,120}process\.env\.NODE_ENV[\s\S]{0,80}production[\s\S]{0,40}\(/,
  );
  assert.ok(
    guard,
    'dev-mode banner must be gated on NODE_ENV !== "production"',
  );
});

test('middleware reads sheba_session cookie for protected routes', () => {
  // The middleware that protects /dashboards/* reads
  // ``request.cookies.get("sheba_auth_token")`` which is the wrong name
  // — TokenStorage writes ``sheba_session``. This was the root cause of
  // "form clears after login": the middleware bounced the operator
  // back to /login because no cookie was visible under the legacy name.
  // We pin the lookup here so the names cannot drift again.
  const proxySource = readFileSync(
    resolve(__dirname, '../../proxy.ts'),
    'utf8',
  );
  assert.match(
    proxySource,
    /request\.cookies\.get\(["']sheba_session["']\)/,
    'middleware must read sheba_session cookie (matches TokenStorage)',
  );
});
