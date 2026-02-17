"use client";

import { useState, useEffect } from "react";

interface Props {
  postId: number;
  initialCount: number;
}

export default function LikeButton({ postId, initialCount }: Props) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/likes?postId=${postId}`)
      .then((r) => r.json())
      .then((data) => {
        setCount(data.count ?? initialCount);
        setLiked(data.liked ?? false);
      })
      .catch(() => {});
  }, [postId, initialCount]);

  async function handleClick() {
    if (loading) return;
    setLoading(true);

    // 낙관적 업데이트
    const newLiked = !liked;
    setLiked(newLiked);
    setCount((c) => (newLiked ? c + 1 : c - 1));

    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      setCount(data.count ?? count);
      setLiked(data.liked ?? newLiked);
    } catch {
      // 실패 시 롤백
      setLiked(!newLiked);
      setCount((c) => (newLiked ? c - 1 : c + 1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-label={liked ? "좋아요 취소" : "좋아요"}
      className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all
        ${liked
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
        } ${loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className={`w-5 h-5 transition-transform ${loading ? "" : "active:scale-125"}`}
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
      <span className="text-sm font-medium tabular-nums">{count}</span>
    </button>
  );
}
