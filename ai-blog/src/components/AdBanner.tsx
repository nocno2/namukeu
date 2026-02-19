"use client";

import { useEffect, useRef } from "react";

interface AdBannerProps {
  slot: string;
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdBanner({ slot, format = "auto", className }: AdBannerProps) {
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;
  const adsEnabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";
  const pushed = useRef(false);

  // 광고가 비활성화되어 있거나 slot/advertisementId가 없으면广告を表示しない
  if (!adsEnabled || !adsenseId || !slot) return null;

  useEffect(() => {
    if (pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded yet
    }
  }, []);

  return (
    <div className={className} aria-hidden="true">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={adsenseId}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
