import { db, schema } from "@/lib/db";
import { eq, and, ne, desc, sql, inArray, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import { markdownToHtml } from "@/lib/markdown";
import { generatePostMetadata, generateJsonLd, generateBreadcrumbJsonLd } from "@/lib/seo";
import { getPostTags } from "@/lib/tags";
import PostContent from "@/components/PostContent";
import ViewTracker from "@/components/ViewTracker";
import AdBanner from "@/components/AdBanner";
import LikeButton from "@/components/LikeButton";
import CommentSection from "@/components/CommentSection";
import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 3600;

const adSlotArticleTop = process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_TOP;
const adSlotArticleBottom = process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_BOTTOM;
const adSlotBeforeRelated = process.env.NEXT_PUBLIC_AD_SLOT_BEFORE_RELATED;
const adSlotAfterRelated = process.env.NEXT_PUBLIC_AD_SLOT_AFTER_RELATED;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.slug, slug), eq(schema.posts.status, "published")))
    .get();

  if (!post) return {};
  return generatePostMetadata(post);
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;

  const post = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      slug: schema.posts.slug,
      content: schema.posts.content,
      excerpt: schema.posts.excerpt,
      featuredImage: schema.posts.featuredImage,
      publishedAt: schema.posts.publishedAt,
      updatedAt: schema.posts.updatedAt,
      categoryName: schema.categories.name,
      categorySlug: schema.categories.slug,
    })
    .from(schema.posts)
    .leftJoin(schema.categories, eq(schema.posts.categoryId, schema.categories.id))
    .where(and(eq(schema.posts.slug, slug), eq(schema.posts.status, "published")))
    .get();

  if (!post) notFound();

  const html = await markdownToHtml(post.content);
  const tags = await getPostTags(post.id);
  const tagNames = tags.map((t) => t.name);
  const jsonLd = generateJsonLd({
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    featuredImage: post.featuredImage,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    content: post.content,
    categoryName: post.categoryName,
    tags: tagNames,
  });

  const breadcrumbJsonLd = generateBreadcrumbJsonLd({
    title: post.title,
    slug: post.slug,
    categoryName: post.categoryName,
    categorySlug: post.categorySlug,
  });

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "AI Blog";

  // 관련 글: 같은 태그를 공유하는 글을 공통 태그 수 기준으로 정렬
  const tagIds = tags.length > 0
    ? await db
        .select({ tagId: schema.tags.id })
        .from(schema.tags)
        .where(inArray(schema.tags.slug, tags.map((t) => t.slug)))
        .then((rows) => rows.map((r) => r.tagId))
    : [];

  // 좋아요 수 + 댓글 수
  const [{ likeCount }] = await db
    .select({ likeCount: count() })
    .from(schema.postLikes)
    .where(eq(schema.postLikes.postId, post.id));

  const [{ commentCount }] = await db
    .select({ commentCount: count() })
    .from(schema.comments)
    .where(and(eq(schema.comments.postId, post.id), eq(schema.comments.isDeleted, false)));

  let relatedPosts: { title: string; slug: string; featuredImage: string | null; publishedAt: string | null }[] = [];

  if (tagIds.length > 0) {
    relatedPosts = await db
      .select({
        title: schema.posts.title,
        slug: schema.posts.slug,
        featuredImage: schema.posts.featuredImage,
        publishedAt: schema.posts.publishedAt,
      })
      .from(schema.posts)
      .innerJoin(schema.postTags, eq(schema.posts.id, schema.postTags.postId))
      .where(
        and(
          eq(schema.posts.status, "published"),
          ne(schema.posts.id, post.id),
          inArray(schema.postTags.tagId, tagIds),
        )
      )
      .groupBy(schema.posts.id)
      .orderBy(desc(sql`count(*)`), desc(schema.posts.publishedAt))
      .limit(4);
  }

  // JSON-LD가 배열인지 객체인지 확인 (FAQ 스키마 포함 여부)
  const jsonLdList = Array.isArray(jsonLd) ? jsonLd : [jsonLd];

  return (
    <>
      {jsonLdList.map((ld, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ViewTracker slug={post.slug} />
      <article className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <div className="flex items-center gap-2 text-sm mb-4">
            {post.categoryName && post.categorySlug && (
              <Link
                href={`/category/${post.categorySlug}`}
                className="tag-chip bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
              >
                {post.categoryName}
              </Link>
            )}
            {post.publishedAt && (
              <time dateTime={post.publishedAt} className="text-[var(--text-muted)]">
                {new Date(post.publishedAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight text-[var(--text-primary)] tracking-tight">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-4 text-lg text-[var(--text-tertiary)] leading-relaxed">{post.excerpt}</p>
          )}
          <address className="mt-4 not-italic text-sm text-[var(--text-muted)]" rel="author">
            {siteName}
          </address>
        </header>

        {adSlotArticleTop && <AdBanner slot={adSlotArticleTop} format="auto" className="my-6" />}

        <section className="article-body">
          <PostContent html={html} showInArticleAd={true} />
        </section>

        {adSlotArticleBottom && <AdBanner slot={adSlotArticleBottom} format="rectangle" className="my-8" />}

        {tags.length > 0 && (
          <footer className="mt-12 pt-8 border-t border-[var(--border-light)]">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={`/tags/${tag.slug}`}
                  className="tag-chip bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          </footer>
        )}

        {/* 좋아요 버튼 */}
        <div className="mt-8 flex justify-center">
          <LikeButton postId={post.id} initialCount={likeCount} />
        </div>

        {adSlotBeforeRelated && <AdBanner slot={adSlotBeforeRelated} format="auto" className="mt-8" />}

        {/* 댓글 섹션 */}
        <CommentSection postId={post.id} initialCount={commentCount} />

        {relatedPosts.length > 0 && (
          <section className="mt-12 pt-8 border-t border-[var(--border-light)]">
            <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-6">
              관련 글
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {relatedPosts.map((rp) => (
                <Link
                  key={rp.slug}
                  href={`/posts/${rp.slug}`}
                  className="group block p-4 rounded-xl border border-[var(--border)]/50 bg-[var(--bg-card)] hover:border-[var(--accent)]/30 transition"
                >
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition line-clamp-2">
                    {rp.title}
                  </h3>
                  {rp.publishedAt && (
                    <time dateTime={rp.publishedAt} className="text-xs text-[var(--text-muted)] mt-1 block">
                      {new Date(rp.publishedAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {adSlotAfterRelated && <AdBanner slot={adSlotAfterRelated} format="auto" className="mt-8" />}
      </article>
    </>
  );
}
