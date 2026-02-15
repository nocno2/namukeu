"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminNav from "@/components/AdminNav";

interface Draft {
  id: number;
  keyword: string;
  topic: string;
  title: string | null;
  status: string;
  reviewScore: number | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  researched: { label: "글감 수집", color: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]" },
  written: { label: "작성 완료", color: "bg-blue-500/15 text-blue-400" },
  reviewed: { label: "검토 완료", color: "bg-yellow-500/15 text-yellow-500" },
  approved: { label: "승인됨", color: "bg-green-500/15 text-green-500" },
  published: { label: "게시됨", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "반려됨", color: "bg-red-500/15 text-red-400" },
};

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrafts();
  }, [filter]);

  async function fetchDrafts() {
    setLoading(true);
    const params = filter ? `?status=${filter}` : "";
    const res = await fetch(`/api/drafts${params}`);
    if (res.ok) {
      const data = await res.json();
      setDrafts(data.drafts);
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-6">초안 관리</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { value: "", label: "전체" },
          { value: "reviewed", label: "검토 완료" },
          { value: "written", label: "작성 완료" },
          { value: "researched", label: "글감 수집" },
          { value: "published", label: "게시됨" },
          { value: "rejected", label: "반려됨" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded text-sm transition ${
              filter === f.value
                ? "bg-[var(--text-secondary)] text-[var(--bg)]"
                : "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--text-tertiary)]">로딩 중...</p>
      ) : drafts.length === 0 ? (
        <p className="text-[var(--text-tertiary)]">초안이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const statusInfo = STATUS_LABELS[draft.status] || {
              label: draft.status,
              color: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]",
            };

            return (
              <Link
                key={draft.id}
                href={`/admin/drafts/${draft.id}`}
                className="block border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                      {draft.reviewScore != null && (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          품질: {draft.reviewScore}/10
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {draft.title || draft.topic}
                    </h3>
                    <p className="text-sm text-[var(--text-tertiary)] mt-1">
                      키워드: {draft.keyword}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--text-muted)] whitespace-nowrap ml-4">
                    {new Date(draft.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
