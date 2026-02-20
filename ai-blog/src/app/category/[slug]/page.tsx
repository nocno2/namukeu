import { db, schema } from "@/lib/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import PostCard from "@/components/PostCard";
import AdBanner from "@/components/AdBanner";
import type { Metadata } from "next";

// AdSense 슬롯 ID
const adSlotTop = process.env.NEXT_PUBLIC_AD_SLOT_CATEGORY_TOP;
const adSlotMid = process.env.NEXT_PUBLIC_AD_SLOT_CATEGORY_MID;
const adSlotBottom = process.env.NEXT_PUBLIC_AD_SLOT_CATEGORY_BOTTOM;

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug)).get();
  if (!category) return {};
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    title: category.name,
    description: category.description || `${category.name} 카테고리의 글 목록`,
    alternates: {
      canonical: `${siteUrl}/category/${slug}`,
    },
  };
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

  const MID_AD_THRESHOLD = 6; // posts가 6개 이상일 때 중간 광고 표시

  // posts를 3개씩 나누기 (중간 광고용)
  const postsWithMidAd: (typeof posts[number] | "AD")[] = posts.length >= MID_AD_THRESHOLD
    ? [...posts.slice(0, 3), "AD" as const, ...posts.slice(3)]
    : posts;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-[var(--text-secondary)] mb-2">{category.name}</h1>
        {category.description && <p className="text-[var(--text-tertiary)]">{category.description}</p>}
      </header>

      {adSlotTop && <AdBanner slot={adSlotTop} format="auto" className="mb-8" />}

      {posts.length === 0 ? (
        <p className="text-[var(--text-tertiary)] text-center py-12">이 카테고리에 게시된 글이 없습니다.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {postsWithMidAd.map((item, idx) =>
            item === "AD" && adSlotMid ? (
              <AdBanner key="mid-ad" slot={adSlotMid} format="auto" className="sm:col-span-2 lg:col-span-3 my-4" />
            ) : item !== "AD" ? (
              <PostCard
                key={item.id}
                title={item.title}
                slug={item.slug}
                excerpt={item.excerpt}
                categoryName={category.name}
                categorySlug={category.slug}
                publishedAt={item.publishedAt}
                featuredImage={item.featuredImage}
                tags={tagsByPostId.get(item.id)}
              />
            ) : null
          )}
        </div>
      )}

      {adSlotBottom && <AdBanner slot={adSlotBottom} format="horizontal" className="mt-10" />}
    </div>
  );
}
