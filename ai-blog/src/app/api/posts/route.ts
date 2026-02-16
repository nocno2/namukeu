import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { desc, eq, and, like, count } from "drizzle-orm";
import { getSession, requireAuth, AuthError } from "@/lib/auth";
import { syncPostTags } from "@/lib/tags";

// GET /api/posts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const allParam = searchParams.get("all") === "true";

  // all=true, status=draft 등 비공개 글 접근은 인증 필요
  const session = await getSession();
  const all = allParam && !!session;

  const offset = (page - 1) * limit;

  const conditions = [];
  if (!all) {
    conditions.push(eq(schema.posts.status, "published"));
  }
  if (status === "draft" || status === "published") {
    conditions.push(eq(schema.posts.status, status));
  }
  if (category) {
    conditions.push(eq(schema.categories.slug, category));
  }
  if (search) {
    conditions.push(like(schema.posts.title, `%${search}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const posts = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      slug: schema.posts.slug,
      excerpt: schema.posts.excerpt,
      status: schema.posts.status,
      featuredImage: schema.posts.featuredImage,
      publishedAt: schema.posts.publishedAt,
      createdAt: schema.posts.createdAt,
      categoryName: schema.categories.name,
      categorySlug: schema.categories.slug,
    })
    .from(schema.posts)
    .leftJoin(schema.categories, eq(schema.posts.categoryId, schema.categories.id))
    .where(where)
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.posts)
    .leftJoin(schema.categories, eq(schema.posts.categoryId, schema.categories.id))
    .where(where);

  return NextResponse.json({
    posts,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// POST /api/posts
export async function POST(request: NextRequest) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    title,
    slug,
    content,
    excerpt,
    categoryId,
    status: rawStatus = "draft",
    featuredImage,
    metaTitle,
    metaDescription,
    tags: tagNames = [],
  } = body;

  if (!title || !slug || !content) {
    return NextResponse.json(
      { error: "title, slug, content are required" },
      { status: 400 }
    );
  }

  // Auto-generate meta fields if not provided
  const finalMetaTitle = metaTitle || (title.length > 60 ? title.substring(0, 57) + "..." : title);
  const finalMetaDescription = metaDescription || excerpt || content.replace(/[#*`>\-\[\]()!]/g, "").substring(0, 155).trim() + "...";

  const status = rawStatus === "published" ? "published" as const : "draft" as const;
  const publishedAt =
    status === "published" ? new Date().toISOString() : null;

  const result = await db
    .insert(schema.posts)
    .values({
      title,
      slug,
      content,
      excerpt,
      categoryId: categoryId || null,
      status,
      featuredImage: featuredImage || null,
      metaTitle: finalMetaTitle,
      metaDescription: finalMetaDescription,
      publishedAt,
    })
    .returning();

  const post = result[0];

  if (tagNames.length > 0) {
    await syncPostTags(post.id, tagNames);
  }

  if (status === "published") {
    revalidatePath("/");
    revalidatePath(`/posts/${slug}`);
    revalidatePath("/tags");
  }

  return NextResponse.json(post, { status: 201 });
}
