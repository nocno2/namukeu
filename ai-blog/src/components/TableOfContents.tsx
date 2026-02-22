"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface TocHeading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  headings: TocHeading[];
}

export default function TableOfContents({ headings }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // IntersectionObserver로 현재 보이는 헤딩 추적
  useEffect(() => {
    const headingElements = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    if (headingElements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // 화면에 보이는 헤딩 중 가장 위에 있는 것을 active로
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-64px 0px -70% 0px", threshold: 0 }
    );

    headingElements.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, [headings]);

  const handleClick = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: "smooth" });
      setActiveId(id);
    }
  }, []);

  if (headings.length < 2) return null;

  return (
    <nav className="toc" aria-label="목차">
      <button
        className="toc-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="toc-title">목차</span>
        <svg
          className={`toc-chevron ${isOpen ? "toc-chevron-open" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <ol className="toc-list">
          {headings.map((heading) => (
            <li
              key={heading.id}
              className={`toc-item ${heading.level === 3 ? "toc-item-sub" : ""}`}
            >
              <a
                href={`#${heading.id}`}
                onClick={(e) => handleClick(e, heading.id)}
                className={`toc-link ${activeId === heading.id ? "toc-link-active" : ""}`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
