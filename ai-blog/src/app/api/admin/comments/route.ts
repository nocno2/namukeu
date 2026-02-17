import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, count } from "drizzle-orm";
import { requireAuth, AuthError } from "@/lib/auth";

// GET /api/admin/comments?page=&limit=&postId=
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "30")));
  const postIdFilter = searchParams.get("postId") ? Number(searchParams.get("postId")) : null;
  const offset = (page - 1) * limit;

  const whereClause = postIdFilter
    ? eq(schema.comments.postId, postIdFilter)
    : undefined;

  const rows = await db
    .select({
      id: schema.comments.id,
      postId: schema.comments.postId,
      postTitle: schema.posts.title,
      postSlug: schema.posts.slug,
      nickname: schema.comments.nickname,
      content: schema.comments.content,
      ipAddress: schema.comments.ipAddress,
      isDeleted: schema.comments.isDeleted,
      createdAt: schema.comments.createdAt,
    })
    .from(schema.comments)
    .leftJoin(schema.posts, eq(schema.comments.postId, schema.posts.id))
    .where(whereClause)
    .orderBy(desc(schema.comments.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = whereClause
    ? await db.select({ total: count() }).from(schema.comments).where(whereClause)
    : await db.select({ total: count() }).from(schema.comments);
  const total = countResult[0].total;

  return NextResponse.json({ comments: rows, total, page, limit });
}
