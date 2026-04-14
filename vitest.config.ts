import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/unit/**/*.test.tsx", "test/integration/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      include: [
        "src/ai/**/*.ts",
        "src/cli/**/*.{ts,tsx}",
        "src/config/**/*.ts",
        "src/git/**/*.ts",
        "src/github/**/*.ts",
        "src/pipeline/**/*.ts",
      ],
      exclude: [
        "test/**",
        "**/src/index.ts",
        "**/src/types/index.ts",
        "**/*.d.ts",
        "vitest.config.ts",
        "eslint.config.js",
      ],
    },
  },
});
