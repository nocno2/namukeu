import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { count, eq, gte, sql, and } from "drizzle-orm";
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

  // 댓글/좋아요 통계
  const [{ total: totalComments }] = await db
    .select({ total: count() })
    .from(schema.comments)
    .where(eq(schema.comments.isDeleted, false));

  const [{ total: todayComments }] = await db
    .select({ total: count() })
    .from(schema.comments)
    .where(and(eq(schema.comments.isDeleted, false), gte(schema.comments.createdAt, today)));

  const [{ total: totalLikes }] = await db
    .select({ total: count() })
    .from(schema.postLikes);

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

  // AdSense 설정 상태 확인
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;
  const adsEnabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";
  const hasAdSlot =
    process.env.NEXT_PUBLIC_AD_SLOT_HERO ||
    process.env.NEXT_PUBLIC_AD_SLOT_MID ||
    process.env.NEXT_PUBLIC_AD_SLOT_BOTTOM ||
    process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_TOP ||
    process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_BOTTOM;
  const adsenseStatus = adsenseId && adsEnabled && hasAdSlot ? "활성" : "미설정";
  const adsenseStatusColor = adsenseId && adsEnabled && hasAdSlot ? "green" : "yellow";

  // Google Search Console 설정 상태
  const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const gscStatus = googleVerification ? "설정됨" : "미설정";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-6">대시보드</h1>

      {/* AdSense 및 SEO 설정 상태 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={`border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-card)]`}>
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-[var(--text-primary)]">AdSense</h2>
            <span className={`text-xs px-2 py-1 rounded bg-${adsenseStatusColor}-500/20 text-${adsenseStatusColor}-500`}>
              {adsenseStatus}
            </span>
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">
            {adsenseId ? `광고주 ID: ${adsenseId.slice(0, 8)}...` : "광고주 ID 미설정"}
          </p>
          {!adsenseId || !hasAdSlot ? (
            <p className="text-xs text-yellow-500 mt-2">
              .env.local에 AdSlot ID를 추가하세요
            </p>
          ) : null}
        </div>
        <div className={`border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-card)]`}>
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-[var(--text-primary)]">Google Search Console</h2>
            <span className={`text-xs px-2 py-1 rounded ${gscStatus === "설정됨" ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"}`}>
              {gscStatus}
            </span>
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">
            {googleVerification ? `검증 코드 설정됨` : "검증 코드 미설정"}
          </p>
          {!googleVerification ? (
            <p className="text-xs text-yellow-500 mt-2">
              GSC에서 메타태그를 가져와 .env.local에 추가하세요
            </p>
          ) : null}
        </div>
      </div>

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

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-[var(--accent)]">{todayViews}</p>
          <p className="text-sm text-[var(--text-tertiary)]">오늘 조회수</p>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-[var(--text-tertiary)]">{totalViews}</p>
          <p className="text-sm text-[var(--text-tertiary)]">전체 조회수</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-purple-500">{todayComments}</p>
          <p className="text-sm text-[var(--text-tertiary)]">오늘 댓글</p>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-[var(--text-tertiary)]">{totalComments}</p>
          <p className="text-sm text-[var(--text-tertiary)]">전체 댓글</p>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4 text-center bg-[var(--bg-card)]">
          <p className="text-3xl font-bold text-red-400">{totalLikes}</p>
          <p className="text-sm text-[var(--text-tertiary)]">전체 좋아요</p>
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
