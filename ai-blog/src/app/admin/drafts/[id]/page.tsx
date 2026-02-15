"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import AdminNav from "@/components/AdminNav";

interface Draft {
  id: number;
  keyword: string;
  topic: string;
  title: string | null;
  slug: string | null;
  content: string | null;
  revisedContent: string | null;
  contentHtml: string | null;
  excerpt: string | null;
  tags: string | null;
  reviewScore: number | null;
  reviewFeedback: string | null;
  rejectReason: string | null;
  status: string;
  createdAt: string;
}

export default function DraftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isImageFile = useCallback((file: File) => {
    if (file.type.startsWith("image/")) return true;
    const ext = file.name.split(".").pop()?.toLowerCase();
    return ext === "heic" || ext === "heif";
  }, []);

  const uploadImage = useCallback(async (file: File) => {
    if (!isImageFile(file)) return;
    setUploading(true);
    try {
      let uploadFile = file;
      if (!file.type && /\.heic$/i.test(file.name)) {
        uploadFile = new File([file], file.name, { type: "image/heic" });
      } else if (!file.type && /\.heif$/i.test(file.name)) {
        uploadFile = new File([file], file.name, { type: "image/heif" });
      }
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "업로드 실패" }));
        alert(err.error || "이미지 업로드 실패");
        return;
      }
      const data = await res.json();
      const url = data.url;
      if (data.saved) console.log(`이미지 최적화: ${data.saved}`);
      const caption = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      const markdown = `\n![${caption}](${url})\n`;

      const ta = textareaRef.current;
      if (ta) {
        const pos = ta.selectionStart;
        const before = editContent.slice(0, pos);
        const after = editContent.slice(pos);
        setEditContent(before + markdown + after);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = pos + markdown.length;
          ta.focus();
        });
      } else {
        setEditContent((prev) => prev + markdown);
      }
    } finally {
      setUploading(false);
    }
  }, [editContent, isImageFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(isImageFile);
    for (const file of files) uploadImage(file);
  }, [uploadImage, isImageFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) uploadImage(file);
    }
  }, [uploadImage]);

  useEffect(() => {
    fetchDraft();
  }, [id]);

  async function fetchDraft() {
    const res = await fetch(`/api/drafts/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDraft(data);
      setEditContent(data.revisedContent || data.content || "");
    }
    setLoading(false);
  }

  async function handleApprove() {
    setActionLoading(true);

    if (editing && editContent !== (draft?.revisedContent || draft?.content)) {
      await fetch(`/api/drafts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisedContent: editContent }),
      });
    }

    const res = await fetch(`/api/drafts/${id}/approve`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      alert(`게시 완료! (slug: ${data.slug})`);
      router.push("/admin/drafts");
    } else {
      const err = await res.json();
      alert(`승인 실패: ${err.error}`);
    }
    setActionLoading(false);
  }

  async function handleReject() {
    setActionLoading(true);
    const res = await fetch(`/api/drafts/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    if (res.ok) {
      alert("반려되었습니다.");
      router.push("/admin/drafts");
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <AdminNav />
        <p className="text-[var(--text-tertiary)]">로딩 중...</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <AdminNav />
        <p className="text-red-500">초안을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const finalContent = draft.revisedContent || draft.content || "";
  let reviewData: { feedback?: string; issues?: { type: string; description: string; suggestion: string }[] } = {};
  if (draft.reviewFeedback) {
    try { reviewData = JSON.parse(draft.reviewFeedback); } catch {}
  }

  let tagList: string[] = [];
  if (draft.tags) {
    try { tagList = JSON.parse(draft.tags); } catch {}
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminNav />

      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          {draft.title || draft.topic}
        </h1>
        <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
          <span>키워드: {draft.keyword}</span>
          {draft.reviewScore != null && (
            <span>품질: {draft.reviewScore}/10</span>
          )}
          <span>상태: {draft.status}</span>
        </div>
        {tagList.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {tagList.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-[var(--bg-subtle)] text-[var(--text-tertiary)] rounded text-xs"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 검토 피드백 */}
      {reviewData.feedback && (
        <div className="border border-[var(--border)] rounded-lg p-4 mb-6 bg-[var(--bg-subtle)]">
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">검토 피드백</h3>
          <p className="text-sm text-[var(--text-tertiary)] mb-3">{reviewData.feedback}</p>
          {reviewData.issues && reviewData.issues.length > 0 && (
            <ul className="space-y-2">
              {reviewData.issues.map((issue, i) => (
                <li key={i} className="text-xs border-l-2 border-[var(--accent)] pl-3">
                  <span className="font-medium text-[var(--accent)]">[{issue.type}]</span>{" "}
                  <span className="text-[var(--text-secondary)]">{issue.description}</span>
                  {issue.suggestion && (
                    <span className="text-[var(--text-tertiary)]"> → {issue.suggestion}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 본문 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[var(--text-primary)]">본문 미리보기</h3>
          {draft.status === "reviewed" && (
            <button
              onClick={() => setEditing(!editing)}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {editing ? "미리보기" : "수정하기"}
            </button>
          )}
        </div>

        {editing ? (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onPaste={handlePaste}
              className="w-full h-[600px] border border-[var(--border)] rounded-lg p-4 font-mono text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none"
            />
            {uploading && (
              <div className="absolute inset-0 bg-[var(--bg)]/80 flex items-center justify-center rounded-lg">
                <span className="text-sm text-[var(--text-tertiary)]">이미지 업로드 중...</span>
              </div>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1">이미지를 드래그하거나 붙여넣기(Ctrl+V)로 삽입할 수 있습니다. (HEIC/HEIF 포함, 자동 WebP 변환)</p>
          </div>
        ) : (
          <div
            className="border border-[var(--border)] rounded-lg p-6 bg-[var(--bg-card)] prose max-w-none"
            dangerouslySetInnerHTML={{ __html: draft.contentHtml || "" }}
          />
        )}
      </div>

      {/* 액션 버튼 */}
      {draft.status === "reviewed" && (
        <div className="flex items-center gap-3 border-t border-[var(--border)] pt-6">
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="bg-green-600 text-white px-6 py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50 transition"
          >
            {actionLoading ? "처리 중..." : "승인 (게시)"}
          </button>
          <button
            onClick={() => setShowReject(!showReject)}
            className="border border-red-400/50 text-red-500 px-6 py-2 rounded font-medium hover:bg-red-500/10 transition"
          >
            반려
          </button>
        </div>
      )}

      {/* 반려 폼 */}
      {showReject && (
        <div className="mt-4 border border-red-400/30 rounded-lg p-4 bg-red-500/5">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="반려 사유를 입력하세요 (선택)"
            className="w-full h-24 border border-red-400/30 rounded p-3 text-sm mb-3 bg-[var(--bg-card)] text-[var(--text-primary)] focus:border-red-400 outline-none"
          />
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {actionLoading ? "처리 중..." : "반려 확인"}
          </button>
        </div>
      )}
    </div>
  );
}
