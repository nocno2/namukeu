"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface PostData {
  id?: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  categoryId: number | null;
  status: string;
  featuredImage: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Editor({ postId }: { postId?: number }) {
  const router = useRouter();
  const [post, setPost] = useState<PostData>({
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    categoryId: null,
    status: "draft",
    featuredImage: "",
    metaTitle: "",
    metaDescription: "",
    tags: [],
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoSlug, setAutoSlug] = useState(!postId);
  const [preview, setPreview] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});

    if (postId) {
      fetch(`/api/posts/${postId}`)
        .then((r) => r.json())
        .then((data) => {
          setPost({
            id: data.id,
            title: data.title,
            slug: data.slug,
            content: data.content,
            excerpt: data.excerpt || "",
            categoryId: data.categoryId,
            status: data.status,
            featuredImage: data.featuredImage || "",
            metaTitle: data.metaTitle || "",
            metaDescription: data.metaDescription || "",
            tags: data.tags || [],
          });
        });
    }
  }, [postId]);

  const updateField = useCallback(
    (field: keyof PostData, value: string | number | null | string[]) => {
      setPost((prev) => {
        const updated = { ...prev, [field]: value };
        if (field === "title" && autoSlug) {
          updated.slug = slugify(value as string);
        }
        return updated;
      });
    },
    [autoSlug]
  );

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !post.tags.includes(trimmed)) {
      updateField("tags", [...post.tags, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    updateField(
      "tags",
      post.tags.filter((t) => t !== tag)
    );
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  async function handleSave(status?: string) {
    setSaving(true);
    const data = {
      ...post,
      status: status || post.status,
    };

    const url = postId ? `/api/posts/${postId}` : "/api/posts";
    const method = postId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const result = await res.json();
      if (!postId) {
        router.push(`/admin/posts/${result.id}/edit`);
      }
      router.refresh();
    }
    setSaving(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const { url } = await res.json();
      updateField("featuredImage", url);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <button
          onClick={() => setPreview(false)}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition ${!preview ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"}`}
        >
          작성
        </button>
        <button
          onClick={() => setPreview(true)}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition ${preview ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)]"}`}
        >
          미리보기
        </button>
      </div>

      {!preview ? (
        <>
          <input
            type="text"
            placeholder="제목을 입력하세요"
            value={post.title}
            onChange={(e) => updateField("title", e.target.value)}
            className="w-full text-2xl font-bold border-0 border-b-2 border-[var(--border)] pb-3 focus:outline-none focus:border-[var(--accent)] bg-transparent text-[var(--text-primary)] transition"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--text-muted)] uppercase">URL</span>
            <input
              type="text"
              value={post.slug}
              onChange={(e) => {
                setAutoSlug(false);
                updateField("slug", e.target.value);
              }}
              className="flex-1 text-sm border border-[var(--border)] rounded-lg px-3 py-1.5 bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:bg-[var(--bg-card)] focus:border-[var(--accent)] outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-[var(--text-muted)] uppercase">카테고리</span>
              <select
                value={post.categoryId || ""}
                onChange={(e) =>
                  updateField("categoryId", e.target.value ? parseInt(e.target.value) : null)
                }
                className="mt-1.5 block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:bg-[var(--bg-card)] focus:border-[var(--accent)] outline-none transition"
              >
                <option value="">선택안함</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[var(--text-muted)] uppercase">대표 이미지</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="mt-1.5 block w-full text-sm text-[var(--text-tertiary)]"
              />
              {post.featuredImage && (
                <img
                  src={post.featuredImage}
                  alt="preview"
                  className="mt-2 h-20 rounded-lg object-cover"
                />
              )}
            </label>
          </div>

          {/* Tags */}
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)] uppercase">태그</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 p-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] min-h-[42px]">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--accent)]/15 text-[var(--accent)] rounded-full text-xs font-medium"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:opacity-70 ml-0.5"
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder={post.tags.length === 0 ? "태그 입력 후 Enter..." : ""}
                className="flex-1 min-w-[120px] border-0 bg-transparent text-sm text-[var(--text-primary)] focus:outline-none py-1 placeholder:text-[var(--text-muted)]"
              />
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-[var(--text-muted)] uppercase">요약</span>
            <textarea
              value={post.excerpt}
              onChange={(e) => updateField("excerpt", e.target.value)}
              rows={2}
              className="mt-1.5 block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:bg-[var(--bg-card)] focus:border-[var(--accent)] outline-none transition"
              placeholder="검색 결과에 표시될 글 요약..."
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[var(--text-muted)] uppercase">본문 (Markdown)</span>
            <textarea
              value={post.content}
              onChange={(e) => updateField("content", e.target.value)}
              rows={24}
              className="mt-1.5 block w-full rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-mono bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:bg-[var(--bg-card)] focus:border-[var(--accent)] outline-none transition leading-relaxed"
              placeholder="마크다운으로 작성하세요..."
            />
          </label>

          <details className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-subtle)]">
            <summary className="text-xs font-medium text-[var(--text-muted)] uppercase cursor-pointer">
              SEO 설정 (선택)
            </summary>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs text-[var(--text-tertiary)]">메타 타이틀</span>
                <input
                  type="text"
                  value={post.metaTitle}
                  onChange={(e) => updateField("metaTitle", e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-tertiary)]">메타 디스크립션</span>
                <textarea
                  value={post.metaDescription}
                  onChange={(e) => updateField("metaDescription", e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
          </details>
        </>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8">
          <h1 className="text-3xl font-extrabold mb-4">{post.title || "제목 없음"}</h1>
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {post.tags.map((tag) => (
                <span key={tag} className="tag-chip bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div
            className="prose"
            dangerouslySetInnerHTML={{
              __html: post.content
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\n/g, "<br>"),
            }}
          />
          <p className="text-sm text-[var(--text-muted)] mt-6">
            (실제 게시글에서는 마크다운이 렌더링됩니다)
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-6 border-t border-[var(--border)]">
        <button
          onClick={() => handleSave("draft")}
          disabled={saving}
          className="border border-[var(--border)] text-[var(--text-secondary)] px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition"
        >
          임시저장
        </button>
        <button
          onClick={() => handleSave("published")}
          disabled={saving}
          className="bg-[var(--accent)] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition shadow-sm"
        >
          {post.status === "published" ? "업데이트" : "게시하기"}
        </button>
      </div>
    </div>
  );
}
