/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export output for FuncHole STATIC runtime hosting — emits a
  // complete static bundle in `out/`.
  output: "export",

  // Surface TS errors as build errors so a broken type never reaches
  // production. Same gate as CI (T-14).
  typescript: {
    ignoreBuildErrors: false,
  },

  // React 19 strict mode surfaces double-render issues early.
  reactStrictMode: true,

  // Unoptimized images for static HTML export
  images: {
    unoptimized: true,
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
