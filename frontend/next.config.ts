import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Pre-existing lint warnings — don't block production builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
