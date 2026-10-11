//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "import/consistent-type-specifier-style": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
      // We render runtime data fetched from a third-party backend whose DTOs
      // are not guaranteed to match our TypeScript shapes. Defensive
      // nullish/undefined checks are intentional. Disable the rule that
      // flags them.
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  {
    ignores: ["eslint.config.js", ".prettierrc"],
  },
]
