# ShebaFi Untitled UI redesign

This branch contains the complete standalone React + Vite design reference exported from Figma Make.

## Extract the reference app

From the repository root, run:

```bash
bash design-reference/extract.sh
cd design-reference/sheba-design-reference
pnpm install
pnpm dev
```

For a production build:

```bash
pnpm build
```

## Contents

The extracted project includes the responsive dashboard, Space Grotesk typography, official Untitled UI icons, tenant table/search, revenue and plan visualizations, tenant provisioning dialog, notifications, and persistent light/dark mode.

## Integration note

This is a visual and interaction reference with demo data. Preserve the production app's authentication, permissions, routing, tenant isolation, and API client. Extract the shell and visual primitives, then migrate existing routes incrementally.
