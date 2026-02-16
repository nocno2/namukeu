import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
