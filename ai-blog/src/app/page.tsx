import { db, schema } from "@/lib/db";
import { desc, eq, sql } from "drizzle-orm";
import PostCard from "@/components/PostCard";
import Link from "next/link";
import { generateWebSiteJsonLd } from "@/lib/seo";

export const revalidate = 3600;

export default async function HomePage() {
  const posts = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      slug: schema.posts.slug,
      excerpt: schema.posts.excerpt,
      featuredImage: schema.posts.featuredImage,
      publishedAt: schema.posts.publishedAt,
      categoryName: schema.categories.name,
      categorySlug: schema.categories.slug,
    })
    .from(schema.posts)
    .leftJoin(schema.categories, eq(schema.posts.categoryId, schema.categories.id))
    .where(eq(schema.posts.status, "published"))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(20);

  const postIds = posts.map((p) => p.id);
  const allPostTags =
    postIds.length > 0
      ? await db
          .select({
            postId: schema.postTags.postId,
            name: schema.tags.name,
            slug: schema.tags.slug,
          })
          .from(schema.postTags)
          .innerJoin(schema.tags, eq(schema.postTags.tagId, schema.tags.id))
          .where(sql`${schema.postTags.postId} IN (${sql.join(postIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];

  const tagsByPostId = new Map<number, { name: string; slug: string }[]>();
  for (const t of allPostTags) {
    if (!tagsByPostId.has(t.postId)) tagsByPostId.set(t.postId, []);
    tagsByPostId.get(t.postId)!.push({ name: t.name, slug: t.slug });
  }

  const popularTags = await db
    .select({
      name: schema.tags.name,
      slug: schema.tags.slug,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.tags)
    .innerJoin(schema.postTags, eq(schema.tags.id, schema.postTags.tagId))
    .groupBy(schema.tags.id)
    .orderBy(desc(sql`count`))
    .limit(10);

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(generateWebSiteJsonLd()) }}
      />
      {/* Hero */}
      <section className="border-b border-[var(--border-light)]">
        <div className="mx-auto max-w-4xl px-6 py-16 md:py-20">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight text-[var(--text-secondary)] mb-4 tracking-tight">
            AI와 차세대 기술의
            <br />
            <span className="text-[var(--accent)]">인사이트</span>
          </h1>
          <p className="text-lg text-[var(--text-tertiary)] max-w-md leading-relaxed">
            최신 트렌드, 심층 분석, 그리고 실무에 바로 쓸 수 있는 실용 가이드.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Popular Tags */}
        {popularTags.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                인기 태그
              </h2>
              <Link href="/tags" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition">
                모두 보기
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={`/tags/${tag.slug}`}
                  className="tag-chip bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-nav)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)]"
                >
                  #{tag.name}
                  <span className="ml-1.5 text-[var(--text-muted)]">{tag.count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Latest Posts */}
        <section>
          <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-6">
            최신 글
          </h2>
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[var(--text-tertiary)] mb-2">아직 게시된 글이 없습니다.</p>
              <p className="text-sm text-[var(--text-muted)]">곧 멋진 콘텐츠가 올라올 예정이에요.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  title={post.title}
                  slug={post.slug}
                  excerpt={post.excerpt}
                  categoryName={post.categoryName ?? undefined}
                  categorySlug={post.categorySlug ?? undefined}
                  publishedAt={post.publishedAt}
                  featuredImage={post.featuredImage}
                  tags={tagsByPostId.get(post.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
