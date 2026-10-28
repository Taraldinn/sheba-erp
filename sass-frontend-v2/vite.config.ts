import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

import type { Plugin } from "vite";

function fixNeonAuthPlugin(): Plugin {
  return {
    name: "fix-neon-auth-global-random-uuid",
    enforce: "pre",
    transform(code) {
      if (code.includes("CURRENT_TAB_CLIENT_ID = crypto.randomUUID()")) {
        return code.replace(
          /const CURRENT_TAB_CLIENT_ID = crypto\.randomUUID\(\);?/g,
          "const CURRENT_TAB_CLIENT_ID = typeof window !== 'undefined' && typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'tab-client-id';"
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    fixNeonAuthPlugin(),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});

