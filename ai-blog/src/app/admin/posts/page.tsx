"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminNav from "@/components/AdminNav";

interface Post {
  id: number;
  title: string;
  slug: string;
  status: string;
  categoryName?: string;
  createdAt: string;
  publishedAt?: string;
}

export default function AdminPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    const res = await fetch("/api/posts?all=true&limit=100");
    if (!res.ok) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    setPosts(data.posts);
    setLoading(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    fetchPosts();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminNav />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">글 관리</h1>
        <Link
          href="/admin/posts/new"
          className="bg-[var(--accent)] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition"
        >
          새 글 작성
        </Link>
      </div>

      {loading ? (
        <p className="text-[var(--text-tertiary)]">로딩 중...</p>
      ) : posts.length === 0 ? (
        <p className="text-[var(--text-tertiary)] text-center py-12">아직 작성된 글이 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="py-2 font-medium">제목</th>
              <th className="py-2 font-medium w-24">상태</th>
              <th className="py-2 font-medium w-28">카테고리</th>
              <th className="py-2 font-medium w-28">작성일</th>
              <th className="py-2 font-medium w-24">작업</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)]">
                <td className="py-3">
                  <Link
                    href={`/admin/posts/${post.id}/edit`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {post.title}
                  </Link>
                </td>
                <td className="py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      post.status === "published"
                        ? "bg-green-500/15 text-green-500"
                        : "bg-yellow-500/15 text-yellow-500"
                    }`}
                  >
                    {post.status === "published" ? "게시됨" : "임시저장"}
                  </span>
                </td>
                <td className="py-3 text-[var(--text-tertiary)]">{post.categoryName || "-"}</td>
                <td className="py-3 text-[var(--text-tertiary)]">
                  {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="text-red-500 hover:text-red-400 text-xs"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
