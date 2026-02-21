import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      // NIKKE 공식/위키 이미지
      { protocol: "https", hostname: "static.wikia.nocookie.net" },
      { protocol: "https", hostname: "nikke-games.com" },
      { protocol: "https", hostname: "cdn-nikke.turnonllc.com" },
      // 구글시트 이미지
      { protocol: "https", hostname: "docs.google.com" },
      { protocol: "https", hostname: "drive.google.com" },
    ],
  },
};

export default nextConfig;
