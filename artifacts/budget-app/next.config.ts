import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // allowedDevOrigins restricts cross-origin dev-server access during `next dev`.
  // Add your own origins here if your dev environment proxies through a custom domain.
  // Example: allowedDevOrigins: ["*.example.com"]
};

export default nextConfig;
