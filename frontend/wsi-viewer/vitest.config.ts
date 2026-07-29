import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/features/**/*.ts",
        "src/hooks/useViewerKeyboardShortcuts.ts",
        "src/hooks/useViewerNavigationPolicy.ts",
        "src/stores/annotationStore.ts",
      ],
      exclude: ["src/test/**"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 85,
        lines: 90,
        "src/features/annotation/geometry/**.ts": {
          statements: 100,
          branches: 95,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
