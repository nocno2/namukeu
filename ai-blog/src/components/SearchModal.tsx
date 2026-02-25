"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SearchResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  titleHighlight: string;
  categoryName: string | null;
  categorySlug: string | null;
  publishedAt: string | null;
  tags: { name: string; slug: string }[];
}

interface SearchResponse {
  results: SearchResult[];
  pagination: { page: number; total: number; pages: number };
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 모달 열릴 때 input 포커스
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTotal(0);
      setSelectedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 전역 단축키: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else {
          // 부모에서 open을 true로 만들어야 하므로, 이 컴포넌트 밖에서 처리
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [open, onClose]);

  // body 스크롤 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // 디바운스 검색
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setResults(data.results);
        setTotal(data.pagination.total);
      }
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(-1);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  };

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0 && results[selectedIndex]) {
        onClose();
        router.push(`/posts/${results[selectedIndex].slug}`);
      } else if (query.trim()) {
        onClose();
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  // 선택된 항목 스크롤
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const el = resultsRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="relative w-full max-w-xl bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-light)]">
          <svg
            className="w-5 h-5 text-[var(--text-tertiary)] shrink-0"
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
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="글 제목, 내용, 태그 검색..."
            className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none text-base"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] rounded border border-[var(--border-light)]">
            ESC
          </kbd>
        </div>

        {/* 검색 결과 */}
        {query.trim() && (
          <div
            ref={resultsRef}
            className="max-h-[50vh] overflow-y-auto overscroll-contain"
          >
            {results.length > 0 ? (
              <>
                {results.map((result, idx) => (
                  <Link
                    key={result.id}
                    href={`/posts/${result.slug}`}
                    onClick={onClose}
                    className={`block px-5 py-3.5 border-b border-[var(--border-light)] last:border-b-0 transition-colors ${
                      idx === selectedIndex
                        ? "bg-[var(--bg-subtle)]"
                        : "hover:bg-[var(--bg-subtle)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {result.categoryName && (
                        <span className="tag-chip bg-[var(--bg-subtle)] text-[var(--text-tertiary)] text-[11px]">
                          {result.categoryName}
                        </span>
                      )}
                      {result.publishedAt && (
                        <time className="text-[11px] text-[var(--text-muted)]">
                          {new Date(result.publishedAt).toLocaleDateString(
                            "ko-KR",
                            { year: "numeric", month: "short", day: "numeric" }
                          )}
                        </time>
                      )}
                    </div>
                    <h3
                      className="text-sm font-medium text-[var(--text-secondary)] mb-1 [&_mark]:bg-[var(--accent)]/20 [&_mark]:text-[var(--accent)] [&_mark]:px-0.5 [&_mark]:rounded"
                      dangerouslySetInnerHTML={{
                        __html: result.titleHighlight,
                      }}
                    />
                    <p
                      className="text-xs text-[var(--text-tertiary)] line-clamp-2 leading-relaxed [&_mark]:bg-[var(--accent)]/20 [&_mark]:text-[var(--accent)] [&_mark]:px-0.5 [&_mark]:rounded"
                      dangerouslySetInnerHTML={{ __html: result.excerpt }}
                    />
                    {result.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {result.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.slug}
                            className="text-[11px] text-[var(--text-muted)]"
                          >
                            #{tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}

                {/* 전체 결과 보기 */}
                {total > results.length && (
                  <Link
                    href={`/search?q=${encodeURIComponent(query.trim())}`}
                    onClick={onClose}
                    className="block px-5 py-3 text-center text-sm text-[var(--accent)] hover:bg-[var(--bg-subtle)] transition-colors"
                  >
                    전체 {total}개 결과 보기 &rarr;
                  </Link>
                )}
              </>
            ) : !loading ? (
              <div className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
                &ldquo;{query}&rdquo;에 대한 검색 결과가 없습니다.
              </div>
            ) : null}
          </div>
        )}

        {/* 하단 힌트 */}
        {!query.trim() && (
          <div className="px-5 py-4 text-xs text-[var(--text-muted)] flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--bg-subtle)] rounded border border-[var(--border-light)] text-[10px]">
                ↑↓
              </kbd>
              이동
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--bg-subtle)] rounded border border-[var(--border-light)] text-[10px]">
                Enter
              </kbd>
              선택
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--bg-subtle)] rounded border border-[var(--border-light)] text-[10px]">
                ESC
              </kbd>
              닫기
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
