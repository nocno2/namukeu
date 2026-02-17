import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "blog.namukeu.com" }],
        destination: "https://namukeu.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
