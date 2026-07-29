import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  // Static export for production (served by nginx)
  ...(isProd ? { output: "export" } : {}),

  // Hide the dev indicator (N badge) in bottom-left corner
  devIndicators: false,

  // Proxy API requests to backend during development
  ...(!isProd
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:4000/api/:path*",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
