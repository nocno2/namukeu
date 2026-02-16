import { db, schema } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Tags",
  description: "모든 태그 목록",
};

export default async function TagsPage() {
  const tags = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      slug: schema.tags.slug,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.tags)
    .innerJoin(schema.postTags, eq(schema.tags.id, schema.postTags.tagId))
    .innerJoin(schema.posts, eq(schema.postTags.postId, schema.posts.id))
    .where(eq(schema.posts.status, "published"))
    .groupBy(schema.tags.id)
    .orderBy(desc(sql`count`));

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-[var(--text-secondary)] mb-2">Tags</h1>
        <p className="text-[var(--text-tertiary)]">주제별로 글을 모아볼 수 있습니다.</p>
      </header>

      {tags.length === 0 ? (
        <p className="text-[var(--text-tertiary)] text-center py-12">아직 태그가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <Link
              key={tag.slug}
              href={`/tags/${tag.slug}`}
              className="group flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/30 hover:shadow-sm transition-all"
            >
              <span className="text-[var(--text-nav)] font-medium group-hover:text-[var(--accent)] transition">#{tag.name}</span>
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full">
                {tag.count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
