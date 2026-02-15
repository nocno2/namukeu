import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { count, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [{ total: totalPosts }] = await db
    .select({ total: count() })
    .from(schema.posts);

  const [{ total: publishedPosts }] = await db
    .select({ total: count() })
    .from(schema.posts)
    .where(eq(schema.posts.status, "published"));

  const [{ total: draftPosts }] = await db
    .select({ total: count() })
    .from(schema.posts)
    .where(eq(schema.posts.status, "draft"));

  // 조회수 통계
  const [{ total: totalViews }] = await db
    .select({ total: count() })
    .from(schema.pageViews);

  const today = new Date().toISOString().split("T")[0];
  const [{ total: todayViews }] = await db
    .select({ total: count() })
    .from(schema.pageViews)
    .where(gte(schema.pageViews.createdAt, today));

  // 인기 글 Top 5
  const popularPosts = await db
    .select({
      slug: schema.pageViews.slug,
      title: schema.posts.title,
      views: sql<number>`count(*)`,
    })
    .from(schema.pageViews)
    .leftJoin(schema.posts, eq(schema.pageViews.postId, schema.posts.id))
    .groupBy(schema.pageViews.slug)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-6">대시보드</h1>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-blue-500">{totalPosts}</p>
          <p className="text-sm text-[var(--text-tertiary)]">전체 글</p>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-green-500">{publishedPosts}</p>
          <p className="text-sm text-[var(--text-tertiary)]">게시됨</p>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-yellow-500">{draftPosts}</p>
          <p className="text-sm text-[var(--text-tertiary)]">임시저장</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-[var(--accent)]">{todayViews}</p>
          <p className="text-sm text-[var(--text-tertiary)]">오늘 조회수</p>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-[var(--text-tertiary)]">{totalViews}</p>
          <p className="text-sm text-[var(--text-tertiary)]">전체 조회수</p>
        </div>
      </div>

      {popularPosts.length > 0 && (
        <div className="border border-[var(--border)] rounded-lg p-4 mb-8 bg-[var(--bg-card)]">
          <h2 className="font-semibold mb-3 text-[var(--text-primary)]">인기 글 Top 5</h2>
          <ul className="space-y-2">
            {popularPosts.map((p, i) => (
              <li key={p.slug} className="flex justify-between items-center text-sm">
                <span className="text-[var(--text-primary)]">
                  <span className="text-[var(--text-muted)] mr-2">{i + 1}.</span>
                  {p.title || p.slug}
                </span>
                <span className="text-[var(--text-tertiary)] font-medium">{p.views}회</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-4">
        <Link
          href="/admin/posts/new"
          className="bg-[var(--accent)] text-white px-4 py-2 rounded font-medium hover:opacity-90 transition"
        >
          새 글 작성
        </Link>
        <Link
          href="/admin/posts"
          className="border border-[var(--border)] text-[var(--text-secondary)] px-4 py-2 rounded font-medium hover:bg-[var(--bg-subtle)] transition"
        >
          글 관리
        </Link>
      </div>
    </div>
  );
}
