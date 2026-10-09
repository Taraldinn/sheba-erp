# ShebaFi Untitled UI redesign reference

Standalone React + Vite implementation of the redesigned ShebaFi SaaS control plane dashboard.

## Run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Integration guidance

This is a visual and interaction reference with demo data. Do not replace the production app wholesale. Extract the shell and primitives, preserve the existing authentication and permission providers, then connect the dashboard to the existing `saasApi` client.

Included: responsive application shell, KPI cards, revenue and plan visualizations, tenant table/search, provisioning dialog, notifications, Space Grotesk typography, and persistent light/dark mode.
