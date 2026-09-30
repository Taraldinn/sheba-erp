/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for the Dokploy / Docker runtime — emits a slim
  // `server.js` with only the files actually used by the app, so the
  // production image stays under 200 MB.
  // Ref: sass-admin/task.md T-04.
  output: "standalone",

  // Surface TS errors as build errors so a broken type never reaches
  // production. Same gate as CI (T-14).
  //
  // NB: Next.js 16 removed the `eslint` config key; lint is run via the
  // `pnpm lint` script in CI separately (T-68).
  typescript: {
    // T-14: surface TS errors as build errors so a broken type never
    // reaches production. Currently blocked by 6 pre-existing errors in
    // components/overview-client.tsx (tracked in task.md §3) — once T-70
    // splits that file, this becomes an effective gate.
    ignoreBuildErrors: false,
  },

  // React 19 strict mode surfaces double-render issues early.
  reactStrictMode: true,

  // Compress images at request time when served from /public.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.shebafi.xyz" },
      { protocol: "https", hostname: "admin.shebafi.xyz" },
    ],
  },

  // Security headers — defence-in-depth on top of Django's. Frames are
  // denied; referrer is stripped on cross-origin requests.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
