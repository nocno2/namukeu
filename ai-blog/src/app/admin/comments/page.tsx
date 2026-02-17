"use client";

import { useState, useEffect, useCallback } from "react";
import AdminNav from "@/components/AdminNav";
import { timeAgo } from "@/lib/utils";

interface Comment {
  id: number;
  postId: number;
  postTitle: string | null;
  postSlug: string | null;
  nickname: string;
  content: string;
  ipAddress: string;
  isDeleted: boolean;
  createdAt: string;
}

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const LIMIT = 30;

  const fetchComments = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/comments?page=${p}&limit=${LIMIT}`);
      const data = await res.json();
      setComments(data.comments);
      setTotal(data.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComments(1);
  }, [fetchComments]);

  async function handleDelete(id: number) {
    if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, isDeleted: true, content: "삭제된 댓글입니다.", nickname: "알 수 없음" }
              : c
          )
        );
      }
    } finally {
      setDeletingId(null);
    }
  }

  const hasMore = page * LIMIT < total;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AdminNav />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">댓글 관리</h1>
        <span className="text-sm text-[var(--text-muted)]">전체 {total}개</span>
      </div>

      {loading && comments.length === 0 ? (
        <p className="text-center text-[var(--text-muted)] py-12">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-center text-[var(--text-muted)] py-12">댓글이 없습니다.</p>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-card)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">게시글</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium w-24">닉네임</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">내용</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium w-28">IP</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium w-24">작성</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {comments.map((comment) => (
                <tr key={comment.id} className={comment.isDeleted ? "opacity-40" : ""}>
                  <td className="px-4 py-3">
                    {comment.postSlug ? (
                      <a
                        href={`/posts/${comment.postSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--text-secondary)] hover:text-[var(--accent)] line-clamp-1"
                      >
                        {comment.postTitle || comment.postSlug}
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{comment.nickname}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] max-w-xs">
                    <span className={`line-clamp-2 ${comment.isDeleted ? "italic" : ""}`}>
                      {comment.content}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{comment.ipAddress}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{timeAgo(comment.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {!comment.isDeleted && (
                      <button
                        onClick={() => handleDelete(comment.id)}
                        disabled={deletingId === comment.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        {deletingId === comment.id ? "..." : "삭제"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchComments(page + 1)}
            disabled={loading}
            className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition"
          >
            더 보기
          </button>
        </div>
      )}
    </div>
  );
}
