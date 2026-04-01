import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // allowedDevOrigins allows cross-origin requests to the dev server from these
  // wildcard patterns. Only applies during `next dev` — no effect in production.
  // The *.replit.dev entries are required when developing inside Replit, where
  // the preview pane proxies requests through a *.replit.dev domain.
  // Contributors developing outside Replit can remove or extend this list.
  allowedDevOrigins: ["*.replit.dev", "*.kirk.replit.dev", "*.repl.co"],
};

export default nextConfig;
