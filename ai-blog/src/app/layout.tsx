import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "AI Blog";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  title: {
    default: `${siteName} - AI와 차세대 기술 블로그`,
    template: `%s | ${siteName}`,
  },
  description:
    "AI, 머신러닝, 차세대 기술 트렌드를 다루는 블로그입니다. 최신 기술 소식과 실용적인 가이드를 제공합니다.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName,
  },
  alternates: {
    types: {
      "application/rss+xml": "/feed",
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;
  const adsEnabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";

  // AdSlot ID 검증 - 하나라도 있으면 유효하다고 판단
  const hasAdSlot =
    process.env.NEXT_PUBLIC_AD_SLOT_HERO ||
    process.env.NEXT_PUBLIC_AD_SLOT_MID ||
    process.env.NEXT_PUBLIC_AD_SLOT_BOTTOM ||
    process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_TOP ||
    process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_BOTTOM ||
    process.env.NEXT_PUBLIC_AD_SLOT_BEFORE_RELATED ||
    process.env.NEXT_PUBLIC_AD_SLOT_AFTER_RELATED;

  // AdSlot이 없으면 AdSense를 비활성화하고 경고
  const effectiveAdsEnabled = adsEnabled && adsenseId && hasAdSlot;

  if (adsEnabled && adsenseId && !hasAdSlot) {
    console.warn("[AdSense] AdSlot ID가 설정되지 않았습니다. .env.local에 AdSlot ID를 추가하거나 NEXT_PUBLIC_ADSENSE_ENABLED=false로 설정하세요.");
  }

  return (
    <html lang="ko">
      <head>
        {gaId && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`,
              }}
            />
          </>
        )}
        {effectiveAdsEnabled && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
