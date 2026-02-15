import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { markdownToHtml } from "@/lib/markdown";
import { generatePostMetadata, generateJsonLd } from "@/lib/seo";
import { getPostTags } from "@/lib/tags";
import PostContent from "@/components/PostContent";
import ViewTracker from "@/components/ViewTracker";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

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
  const jsonLd = generateJsonLd({
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    featuredImage: post.featuredImage,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  });

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "AI Blog";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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

        <section className="article-body">
          <PostContent html={html} />
        </section>

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
      </article>
    </>
  );
}
