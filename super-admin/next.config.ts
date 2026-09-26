import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://api.shebafi.xyz/api/v1"
        : "http://localhost:8000/api/v1"),
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://api.shebafi.xyz/api/v1"
        : "http://localhost:8000/api/v1"),
    NEXT_PUBLIC_ERP_URL:
      process.env.NEXT_PUBLIC_ERP_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://app.shebafi.xyz"
        : "http://localhost:3000"),
  },
};

export default nextConfig;
