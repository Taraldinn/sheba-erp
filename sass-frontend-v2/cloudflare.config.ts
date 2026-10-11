import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "sheba-frontend",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-11",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      NEXTJS_ENV: "production",
    },
  }),
});
