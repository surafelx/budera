import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  // PGlite boots a WebAssembly Postgres; the first start can take a while on slower machines.
  test: { environment: "node", testTimeout: 60000, hookTimeout: 120000, include: ["tests/**/*.test.ts"] },
});
