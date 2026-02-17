"use client";

import { useState, useEffect, useRef } from "react";
import { timeAgo } from "@/lib/utils";

interface Comment {
  id: number;
  nickname: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
}

interface Props {
  postId: number;
  initialCount: number;
}

export default function CommentSection({ postId, initialCount }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  // 폼 상태
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // 삭제 상태 (댓글 id → 비밀번호 입력 표시)
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const LIMIT = 20;

  async function fetchComments(p: number, replace = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/comments?postId=${postId}&page=${p}&limit=${LIMIT}`);
      const data = await res.json();
      setComments((prev) => replace ? data.comments : [...prev, ...data.comments]);
      setTotal(data.total);
      setHasMore(p * LIMIT < data.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchComments(1, true);
  }, [postId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, nickname, password, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "오류가 발생했습니다");
        return;
      }
      // 새 댓글을 목록 맨 앞에 추가
      setComments((prev) => [data.comment, ...prev]);
      setTotal((t) => t + 1);
      setNickname("");
      setPassword("");
      setContent("");
    } catch {
      setFormError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "오류가 발생했습니다");
        return;
      }
      setComments((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, isDeleted: true, nickname: "알 수 없음", content: "삭제된 댓글입니다." }
            : c
        )
      );
      setDeletingId(null);
      setDeletePassword("");
    } catch {
      setDeleteError("네트워크 오류가 발생했습니다");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mt-12 pt-8 border-t border-[var(--border-light)]">
      <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-6">
        댓글 {total > 0 && <span className="normal-case">({total})</span>}
      </h2>

      {/* 댓글 작성 폼 */}
      <form onSubmit={handleSubmit} className="mb-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="닉네임"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
            />
          </div>
          <div className="flex-1">
            <input
              type="password"
              placeholder="비밀번호 (삭제 시 필요)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={4}
              maxLength={20}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
            />
          </div>
        </div>
        <div className="mb-3">
          <textarea
            placeholder="댓글을 작성하세요..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            required
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 resize-none"
          />
          <div className="text-right text-xs text-[var(--text-muted)] mt-1">{content.length}/1000</div>
        </div>
        {formError && <p className="text-red-500 text-xs mb-2">{formError}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? "작성 중..." : "댓글 작성"}
          </button>
        </div>
      </form>

      {/* 댓글 목록 */}
      {loading && comments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">첫 번째 댓글을 남겨보세요!</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="py-4 border-b border-[var(--border-light)] last:border-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${comment.isDeleted ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                    {comment.nickname}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{timeAgo(comment.createdAt)}</span>
                </div>
                {!comment.isDeleted && (
                  <button
                    onClick={() => {
                      setDeletingId(deletingId === comment.id ? null : comment.id);
                      setDeletePassword("");
                      setDeleteError("");
                    }}
                    className="text-xs text-[var(--text-muted)] hover:text-red-500 transition"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className={`text-sm whitespace-pre-wrap leading-relaxed ${comment.isDeleted ? "text-[var(--text-muted)] italic" : "text-[var(--text-secondary)]"}`}>
                {comment.content}
              </p>

              {/* 인라인 삭제 확인 */}
              {deletingId === comment.id && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="비밀번호 입력"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-red-400"
                  />
                  <button
                    onClick={() => handleDelete(comment.id)}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition"
                  >
                    {deleting ? "..." : "확인"}
                  </button>
                  <button
                    onClick={() => { setDeletingId(null); setDeletePassword(""); setDeleteError(""); }}
                    className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                  >
                    취소
                  </button>
                  {deleteError && <span className="text-xs text-red-500">{deleteError}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 더 보기 */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => fetchComments(page + 1)}
            disabled={loading}
            className="px-4 py-2 text-sm text-[var(--text-tertiary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition"
          >
            {loading ? "불러오는 중..." : "더 보기"}
          </button>
        </div>
      )}
    </section>
  );
}
