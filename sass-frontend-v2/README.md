# TanStack Start + shadcn/ui

This is a template for a new TanStack Start project with React, TypeScript, and shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Live End-to-End Tests

The `pnpm test:e2e:live` script runs integration smoke tests against a live Django backend rather than the mock server. This ensures the frontend correctly forms headers and handles real tenant structures.

To run the live tests locally, provide valid backend credentials via environment variables:

```bash
VITE_E2E_API_BASE_URL=http://localhost:8000/api/v1 \
VITE_E2E_SUPER_USER=admin \
VITE_E2E_SUPER_PASS=admin123 \
VITE_E2E_TENANT_USER=tenant_admin \
VITE_E2E_TENANT_PASS=tenant123 \
VITE_E2E_TENANT_SLUG=my-tenant \
pnpm test:e2e:live
```
