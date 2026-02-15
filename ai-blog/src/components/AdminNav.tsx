"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminNav() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <nav className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border)]">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-lg font-bold text-[var(--text-primary)]">
          Admin
        </Link>
        <Link
          href="/admin/posts"
          className="text-sm text-[var(--text-nav)] hover:text-[var(--text-primary)]"
        >
          글 관리
        </Link>
        <Link
          href="/admin/posts/new"
          className="text-sm text-[var(--text-nav)] hover:text-[var(--text-primary)]"
        >
          새 글 작성
        </Link>
        <Link
          href="/admin/drafts"
          className="text-sm text-[var(--text-nav)] hover:text-[var(--text-primary)]"
        >
          초안 관리
        </Link>
        <Link
          href="/"
          className="text-sm text-[var(--text-nav)] hover:text-[var(--text-primary)]"
        >
          블로그 보기
        </Link>
      </div>
      <button
        onClick={handleLogout}
        className="text-sm text-red-500 hover:text-red-700"
      >
        로그아웃
      </button>
    </nav>
  );
}
