"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SearchModal from "./SearchModal";

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Ctrl+K / Cmd+K 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--border-light)]">
        <nav className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-[var(--text-secondary)]"
          >
            Namukeu Blog
          </Link>

          {/* 데스크톱 네비게이션 */}
          <div className="hidden sm:flex items-center gap-1 text-sm">
            <Link
              href="/category/ai"
              className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
            >
              AI
            </Link>
            <Link
              href="/category/next-gen"
              className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
            >
              Next Gen
            </Link>
            <Link
              href="/tags"
              className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
            >
              Tags
            </Link>
            <Link
              href="/about"
              className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
            >
              About
            </Link>
            {/* 검색 버튼 */}
            <button
              onClick={openSearch}
              className="ml-2 p-2 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
              aria-label="검색"
              title="검색 (⌘K)"
            >
              <svg
                className="w-[18px] h-[18px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </button>
          </div>

          {/* 모바일: 검색 + 햄버거 */}
          <div className="flex sm:hidden items-center gap-1">
            <button
              onClick={openSearch}
              className="p-2 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
              aria-label="검색"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
              aria-label="메뉴"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {/* 모바일 메뉴 */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-[var(--border-light)] bg-[var(--bg)]/95 backdrop-blur-md">
            <div className="max-w-4xl mx-auto px-6 py-3 flex flex-col gap-1">
              <Link
                href="/category/ai"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
              >
                AI
              </Link>
              <Link
                href="/category/next-gen"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
              >
                Next Gen
              </Link>
              <Link
                href="/tags"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
              >
                Tags
              </Link>
              <Link
                href="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition"
              >
                About
              </Link>
            </div>
          </div>
        )}
      </header>

      <SearchModal open={searchOpen} onClose={closeSearch} />
    </>
  );
}
