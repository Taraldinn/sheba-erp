import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the Shebafi TanStack frontend.
 *
 * Two projects run the same suite:
 *
 *   1. `chromium` (default) — uses the in-process mock fixture
 *      (tests/e2e-fixtures/mock-api.ts) so the suite is self-contained
 *      and can run in any CI worker.
 *
 *   2. `live` — set `VITE_E2E_LIVE=1` and a real backend URL via
 *      `VITE_E2E_API_BASE_URL`; the mock fixture is then a no-op and
 *      every request hits the real Django service. The web server is
 *      still the local `vite preview` but it's rebuilt with the
 *      VITE_API_BASE_URL baked into the bundle.
 *
 * Set PLAYWRIGHT_BROWSERS_PATH=0 in your shell so the chromium binary
 * stored in node_modules/.local-browsers is picked up; otherwise Playwright
 * looks under ~/.cache/ms-playwright which is empty in this workspace.
 */
const apiBase = process.env.VITE_E2E_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    use: {
        baseURL: process.env.VITE_E2E_BASE_URL ?? 'http://localhost:3000',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        // Expose the API base to tests so they can probe it directly.
        extraHTTPHeaders: { 'x-e2e-api': apiBase },
    },
    projects: [
        {
            name: 'chromium',
            // Hide the live project unless the operator opts in.
            // We do this with a runtime condition via grep — Playwright
            // does not support a top-level conditional `projects`
            // entry, so the spec itself short-circuits when the env
            // is missing. The `testIgnore` regex below keeps the live
            // spec from running in the default project.
            testIgnore: /.*\.live\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'live',
            testMatch: /.*\.live\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: process.env.VITE_E2E_NO_SERVER
        ? undefined
        : {
              // Use the production preview build for E2E — the dev server has
              // module-resolution issues with the dynamically-imported
              // @tanstack/react-start client entry on certain platforms.
              command: 'pnpm build && pnpm preview --port 3000',
              url: process.env.VITE_E2E_BASE_URL ?? 'http://localhost:3000',
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
              // Pass the live API base through to the build so the bundle
              // is pointed at the real backend. In the mock project this
              // is harmless (the route handler is a no-op).
              env: { VITE_API_BASE_URL: apiBase },
          },
});
