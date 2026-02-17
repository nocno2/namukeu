import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, desc, count } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

// GET /api/comments?postId=&page=&limit=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const postId = Number(searchParams.get("postId"));
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || "20")));

  if (!postId || isNaN(postId)) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: schema.comments.id,
      nickname: schema.comments.nickname,
      content: schema.comments.content,
      isDeleted: schema.comments.isDeleted,
      createdAt: schema.comments.createdAt,
    })
    .from(schema.comments)
    .where(eq(schema.comments.postId, postId))
    .orderBy(desc(schema.comments.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.comments)
    .where(eq(schema.comments.postId, postId));

  const comments = rows.map((c) => ({
    id: c.id,
    nickname: c.isDeleted ? "알 수 없음" : c.nickname,
    content: c.isDeleted ? "삭제된 댓글입니다." : c.content,
    isDeleted: c.isDeleted,
    createdAt: c.createdAt,
  }));

  return NextResponse.json({ comments, total, page, limit });
}

// POST /api/comments
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  let body: { postId?: unknown; nickname?: unknown; password?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const postId = Number(body.postId);
  const nickname = String(body.nickname || "").trim().slice(0, 20);
  const password = String(body.password || "");
  const content = String(body.content || "")
    .trim()
    .replace(/<[^>]*>/g, "") // HTML 태그 제거
    .slice(0, 1000);

  if (!postId || isNaN(postId)) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }
  if (!nickname || nickname.length < 1) {
    return NextResponse.json({ error: "닉네임을 입력해주세요" }, { status: 400 });
  }
  if (!password || password.length < 4 || password.length > 20) {
    return NextResponse.json({ error: "비밀번호는 4-20자여야 합니다" }, { status: 400 });
  }
  if (!content || content.length < 1) {
    return NextResponse.json({ error: "댓글 내용을 입력해주세요" }, { status: 400 });
  }

  // Rate limit: IP당 게시글당 5개/시간
  if (!checkRateLimit("comment-create", `${ip}:${postId}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 429 });
  }

  // 게시글 존재 확인
  const post = await db
    .select({ id: schema.posts.id, slug: schema.posts.slug })
    .from(schema.posts)
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.status, "published")))
    .get();

  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [comment] = await db
    .insert(schema.comments)
    .values({ postId, nickname, passwordHash, content, ipAddress: ip })
    .returning({
      id: schema.comments.id,
      nickname: schema.comments.nickname,
      content: schema.comments.content,
      createdAt: schema.comments.createdAt,
    });

  revalidatePath(`/posts/${post.slug}`);

  return NextResponse.json({ comment }, { status: 201 });
}
