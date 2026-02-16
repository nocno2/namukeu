import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getSession, requireAuth, AuthError } from "@/lib/auth";
import { syncPostTags, getPostTags } from "@/lib/tags";

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/posts/:id
export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const post = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, parseInt(id)))
    .get();

  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // draft 글은 인증된 사용자만 접근 가능
  if (post.status === "draft") {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const tags = await getPostTags(post.id);

  return NextResponse.json({ ...post, tags: tags.map((t) => t.name) });
}

// PUT /api/posts/:id
export async function PUT(request: NextRequest, ctx: Ctx) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }
  const { id } = await ctx.params;
  const body = await request.json();

  const existing = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, parseInt(id)))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { tags: tagNames, ...postData } = body;

  // If status changed to published and wasn't before, set publishedAt
  const publishedAt =
    postData.status === "published" && existing.status !== "published"
      ? new Date().toISOString()
      : postData.status === "published"
        ? existing.publishedAt
        : null;

  const result = await db
    .update(schema.posts)
    .set({
      ...postData,
      publishedAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.posts.id, parseInt(id)))
    .returning();

  // Sync tags
  if (Array.isArray(tagNames)) {
    await syncPostTags(parseInt(id), tagNames);
  }

  const updated = result[0];
  revalidatePath("/");
  revalidatePath(`/posts/${updated.slug}`);
  revalidatePath("/tags");
  if (existing.slug !== updated.slug) {
    revalidatePath(`/posts/${existing.slug}`);
  }

  return NextResponse.json(updated);
}

// DELETE /api/posts/:id
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }
  const { id } = await ctx.params;

  const result = await db
    .delete(schema.posts)
    .where(eq(schema.posts.id, parseInt(id)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = result[0];
  revalidatePath("/");
  revalidatePath(`/posts/${deleted.slug}`);
  revalidatePath("/tags");

  return NextResponse.json({ ok: true });
}
