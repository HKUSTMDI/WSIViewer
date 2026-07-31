import type { NextConfig } from "next";
import { APP_BASE_PATH } from "./src/lib/deployment";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  // Playwright uses an isolated output directory so its dev server can run
  // alongside a developer's normal `npm run dev` process.
  ...(process.env.NEXT_DIST_DIR
    ? { distDir: process.env.NEXT_DIST_DIR }
    : {}),

  // Static export for production (served by nginx)
  ...(isProd ? { output: "export" } : {}),

  // Next.js writes this into links and static asset URLs at build time. Keep
  // it empty for root deployments or set it to e.g. /openmetal-wsiviewer.
  ...(APP_BASE_PATH ? { basePath: APP_BASE_PATH } : {}),

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
