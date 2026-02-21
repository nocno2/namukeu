import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NIKKE 간략 육성 가이드",
  description: "NIKKE 게임 캐릭터 별養成 가이드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-[var(--nikke-bg)]">
        <header className="sticky top-0 z-50 bg-[var(--nikke-bg-secondary)]/80 backdrop-blur-md border-b border-[var(--nikke-neon-pink)]/30">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <a href="/" className="text-2xl font-bold neon-pink">NIKKE 가이드</a>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-16 py-8 text-center text-[var(--nikke-text-muted)] border-t border-[var(--nikke-neon-blue)]/20">
          <p>© 2026 NIKKE 간략育成가이드</p>
        </footer>
      </body>
    </html>
  );
}
