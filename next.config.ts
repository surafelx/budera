import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // PGlite ships WebAssembly and data files; load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
  },
};

export default nextConfig;
