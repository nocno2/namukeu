import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function syncPostTags(postId: number, tagNames: string[]) {
  // Delete existing tags for this post
  await db.delete(schema.postTags).where(eq(schema.postTags.postId, postId));

  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;

    const tagSlug = slugify(trimmed);

    // Find or create tag
    let tag = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.slug, tagSlug))
      .get();

    if (!tag) {
      const [newTag] = await db
        .insert(schema.tags)
        .values({ name: trimmed, slug: tagSlug })
        .returning();
      tag = newTag;
    }

    // Link post <-> tag
    await db.insert(schema.postTags).values({ postId, tagId: tag.id });
  }
}

export async function getPostTags(postId: number) {
  return db
    .select({ name: schema.tags.name, slug: schema.tags.slug })
    .from(schema.postTags)
    .innerJoin(schema.tags, eq(schema.postTags.tagId, schema.tags.id))
    .where(eq(schema.postTags.postId, postId));
}
