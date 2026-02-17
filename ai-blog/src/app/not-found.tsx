import Link from "next/link";
import AdBanner from "@/components/AdBanner";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export default async function NotFound() {
  const recentPosts = await db
    .select({
      title: schema.posts.title,
      slug: schema.posts.slug,
      publishedAt: schema.posts.publishedAt,
    })
    .from(schema.posts)
    .where(eq(schema.posts.status, "published"))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(5);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-center mb-12">
        <p className="text-6xl font-bold text-[var(--accent)] mb-4">404</p>
        <h1 className="text-2xl font-bold text-[var(--text-secondary)] mb-2">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="text-[var(--text-tertiary)]">
          요청하신 페이지가 삭제되었거나 주소가 변경되었을 수 있습니다.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 px-5 py-2.5 rounded-full bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition"
        >
          홈으로 돌아가기
        </Link>
      </div>

      <AdBanner slot="404-mid" format="auto" className="my-10" />

      {recentPosts.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">
            최신 글 둘러보기
          </h2>
          <ul className="space-y-3">
            {recentPosts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/posts/${post.slug}`}
                  className="group flex items-center justify-between p-3 rounded-lg border border-[var(--border)]/50 bg-[var(--bg-card)] hover:border-[var(--accent)]/30 transition"
                >
                  <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition line-clamp-1">
                    {post.title}
                  </span>
                  {post.publishedAt && (
                    <time
                      dateTime={post.publishedAt}
                      className="text-xs text-[var(--text-muted)] ml-4 shrink-0"
                    >
                      {new Date(post.publishedAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
