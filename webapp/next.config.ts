import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the build root to this package directory so Turbopack doesn't walk up
  // to the git root when the app lives in a subdirectory of a monorepo/repo.
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
