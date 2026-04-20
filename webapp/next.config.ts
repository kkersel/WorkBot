import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's project root to this package — otherwise it walks up to
  // the git root and `@/*` aliases break when Next.js lives in a subdirectory.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Do NOT set outputFileTracingRoot — it conflicts with Vercel's own
  // modifyConfig step (observed: ENOENT routes-manifest-deterministic.json).
};

export default nextConfig;
