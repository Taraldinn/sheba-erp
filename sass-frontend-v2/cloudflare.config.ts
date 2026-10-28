import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "sheba-frontend",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-26",
    compatibilityFlags: ["nodejs_compat"],
    workersDev: true,
    previewUrls: true,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    domains: [
      "shebafi.xyz",
      "app.shebafi.xyz",
      "admin.shebafi.xyz",
    ],
    observability: {
      enabled: false,
      headSamplingRate: 1,
      redactQueryString: false,
      logs: {
        enabled: true,
        headSamplingRate: 1,
        invocationLogs: true,
        persist: true,
      },
      traces: {
        enabled: true,
        headSamplingRate: 1,
        persist: true,
      },
      issues: {
        enabled: true,
      },
    },
    env: {
      ASSETS: bindings.assets(),
      NEXTJS_ENV: bindings.text("production"),

      // Neon Database
      DATABASE_URL: bindings.secret(),

      // Neon Auth
      NEON_AUTH_BASE_URL: bindings.secret(),
      NEON_AUTH_COOKIE_SECRET: bindings.secret(),
      NEON_AUTH_COOKIE_DOMAIN: bindings.secret(),
    },
  }),
});
