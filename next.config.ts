import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Handwriting PNGs go through a server action.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
