import { db, schema } from "@/lib/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import PostCard from "@/components/PostCard";
import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const tag = await db.select().from(schema.tags).where(eq(schema.tags.slug, decoded)).get();
  if (!tag) return {};
  return { title: `#${tag.name}`, description: `#${tag.name} 태그가 달린 글 목록` };
}

export default async function TagPage({ params }: Props) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);

  const tag = await db.select().from(schema.tags).where(eq(schema.tags.slug, decoded)).get();
  if (!tag) notFound();

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
    .innerJoin(schema.postTags, eq(schema.posts.id, schema.postTags.postId))
    .leftJoin(schema.categories, eq(schema.posts.categoryId, schema.categories.id))
    .where(and(eq(schema.postTags.tagId, tag.id), eq(schema.posts.status, "published")))
    .orderBy(desc(schema.posts.publishedAt));

  const postIds = posts.map((p) => p.id);
  const allPostTags =
    postIds.length > 0
      ? await db
          .select({ postId: schema.postTags.postId, name: schema.tags.name, slug: schema.tags.slug })
          .from(schema.postTags)
          .innerJoin(schema.tags, eq(schema.postTags.tagId, schema.tags.id))
          .where(sql`${schema.postTags.postId} IN (${sql.join(postIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];

  const tagsByPostId = new Map<number, { name: string; slug: string }[]>();
  for (const t of allPostTags) {
    if (!tagsByPostId.has(t.postId)) tagsByPostId.set(t.postId, []);
    tagsByPostId.get(t.postId)!.push({ name: t.name, slug: t.slug });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <Link href="/tags" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--accent)] mb-2 inline-block transition">
          &larr; 모든 태그
        </Link>
        <h1 className="text-3xl font-bold text-[var(--text-secondary)]">
          <span className="text-[var(--accent)]">#</span>{tag.name}
        </h1>
        <p className="text-[var(--text-tertiary)] mt-1">{posts.length}개의 글</p>
      </header>

      {posts.length === 0 ? (
        <p className="text-[var(--text-tertiary)] text-center py-12">이 태그에 해당하는 글이 없습니다.</p>
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
    </div>
  );
}
