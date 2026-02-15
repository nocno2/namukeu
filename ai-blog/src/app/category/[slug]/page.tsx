import { db, schema } from "@/lib/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import PostCard from "@/components/PostCard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug)).get();
  if (!category) return {};
  return { title: category.name, description: category.description || `${category.name} 카테고리의 글 목록` };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug)).get();
  if (!category) notFound();

  const posts = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      slug: schema.posts.slug,
      excerpt: schema.posts.excerpt,
      featuredImage: schema.posts.featuredImage,
      publishedAt: schema.posts.publishedAt,
    })
    .from(schema.posts)
    .where(and(eq(schema.posts.categoryId, category.id), eq(schema.posts.status, "published")))
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
        <h1 className="text-3xl font-bold text-[var(--text-secondary)] mb-2">{category.name}</h1>
        {category.description && <p className="text-[var(--text-tertiary)]">{category.description}</p>}
      </header>

      {posts.length === 0 ? (
        <p className="text-[var(--text-tertiary)] text-center py-12">이 카테고리에 게시된 글이 없습니다.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              title={post.title}
              slug={post.slug}
              excerpt={post.excerpt}
              categoryName={category.name}
              categorySlug={category.slug}
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
