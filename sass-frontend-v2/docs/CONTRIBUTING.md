# Contributing to the Shebafi frontend

This document is the working agreement for engineers who push to this
repo. It is deliberately short: it points at the rules, the tooling,
and the places where opinions are recorded.

## Quick checklist

Before opening a PR, the following must pass locally:

```bash
pnpm typecheck   # tsc --noEmit, must exit 0
pnpm lint        # eslint, must exit 0
pnpm exec vitest run   # 35 unit tests, must all pass
pnpm test:e2e    # 28 Playwright tests, must all pass
pnpm build       # vite build, must finish without errors
```

These are the same checks the CI pipeline runs; if any of them fails
locally, the PR will not be merged.

## Code style

- **Linter** — ESLint with `@tanstack/eslint-config`. We disable a
  handful of rules (`@typescript-eslint/no-unnecessary-condition`,
  `import/no-cycle`, `import/order`, etc.) because the codebase
  intentionally fetches data from a third-party backend whose DTOs
  are not guaranteed to match our TypeScript shapes — see
  `eslint.config.js` for the current list.
- **Formatter** — Prettier with `prettier-plugin-tailwindcss` for
  class sorting. `pnpm format` rewrites the tree, `pnpm check`
  asserts it.
- **TypeScript** — strict mode is on. New modules should declare
  explicit return types on exported functions unless the inference
  is obvious.

## Folder layout

| Path                  | Purpose |
|-----------------------|---------|
| `src/components/`     | Shared, design-system UI primitives (Radix + shadcn-style). |
| `src/components/feedback/` | Status badge, page header, list toolbar, KpiCard, MoneyText, etc. |
| `src/lib/api/`        | The typed HTTP client. One file per resource, plus a shared `client.ts`. |
| `src/lib/auth/`       | AuthProvider + portal-scoped session storage + RouteGuard. |
| `src/lib/portal/`     | Portal resolver + provider + dev switcher. |
| `src/lib/permissions/`| `useCan` hook that maps `(role, permission) → boolean`. |
| `src/lib/query/`      | Centralised `queryKeys` factory. |
| `src/lib/errors/`     | ApiError / NetworkError classes and the `friendlyError` mapper. |
| `src/lib/mutation-toast.ts` | Wraps mutations in a sonner toast. |
| `src/routes/`         | File-based routes. One directory per portal (`public/`, `saas/`, `isp/`, `tenant/`). |

## Adding a new screen

1. Find the right portal folder under `src/routes/<portal>/`. Use a
   file name that matches the URL segment (e.g. `customers.tsx` for
   `/tenant/customers`).
2. Pull data through the existing API module in `src/lib/api/`. If
   the endpoint isn't there, add a small module that wraps
   `fetchApi(...)` rather than calling `fetch` directly.
3. Build the UI from the primitives in
   `src/components/feedback/`. Don't re-implement `PageHeader`,
   `ListToolbar`, `StatusBadge`, etc. ad hoc.
4. Wrap mutations in `withMutationToast` so the user gets a success
   or error toast without each call site having to handle it.
5. Add a heading-level `data-testid` to the table (`testId="..."`)
   so Playwright can target it.
6. Add an E2E spec entry. Even one assertion is enough — future
   regressions on the same page will be caught.

## Testing policy

- **Unit tests** live under `src/` next to the code they test
  (`*.test.tsx`). Use Vitest + React Testing Library.
- **E2E tests** live in `e2e/`. Default mode uses the mock
  fixture; opt into live mode with `pnpm test:e2e:live` (see
  `docs/E2E_TESTS.md`).

## Lint policy: what we keep on and what we keep off

| Rule                                            | State | Why |
|-------------------------------------------------|-------|-----|
| `@typescript-eslint/no-unnecessary-condition`   | off   | We defensively null-check third-party DTOs. |
| `import/no-cycle`                               | off   | We have intentional re-exports through the `src/lib/api/index.ts` barrel. |
| `import/order`                                  | off   | TanStack Start's generated route imports break the canonical sort order; we sort by hand in new files. |
| `import/consistent-type-specifier-style`        | off   | Mixed inline/imported types read better in some files. |
| `sort-imports`                                  | off   | Same reason. |
| `@typescript-eslint/array-type`                 | off   | Both `T[]` and `Array<T>` are used in the same project. |
| `@typescript-eslint/require-await`              | off   | We have `async` methods that return values synchronously for ergonomic reasons. |
| `pnpm/json-enforce-catalog`                     | off   | Not using pnpm catalog. |

Any new rule turned on should be discussed in a PR before it lands;
turning on a rule with thousands of existing violations is a chore
for whoever reviews the PR.

## Security

If a change touches auth, the portal resolver, the API client, or
the CORS / CSRF configuration, please read `docs/SECURITY_AND_LIMITATIONS.md`
first. New dependencies need a justification in the PR description.
