import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireAuth, AuthError } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

// DELETE /api/comments/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const commentId = Number(id);
  if (!commentId || isNaN(commentId)) {
    return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
  }

  const comment = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId))
    .get();

  if (!comment) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }
  if (comment.isDeleted) {
    return NextResponse.json({ error: "이미 삭제된 댓글입니다" }, { status: 400 });
  }

  // 관리자 인증 체크
  let isAdmin = false;
  try {
    await requireAuth();
    isAdmin = true;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
  }

  if (!isAdmin) {
    // 일반 사용자: 비밀번호 확인
    const ip = getClientIp(request);
    if (!checkRateLimit("comment-delete", ip, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 429 });
    }

    let body: { password?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "비밀번호를 입력해주세요" }, { status: 400 });
    }

    const password = String(body.password || "");
    const valid = await bcrypt.compare(password, comment.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 401 });
    }
  }

  // 게시글 slug 조회 (revalidatePath용)
  const post = await db
    .select({ slug: schema.posts.slug })
    .from(schema.posts)
    .where(eq(schema.posts.id, comment.postId))
    .get();

  await db
    .update(schema.comments)
    .set({ isDeleted: true })
    .where(eq(schema.comments.id, commentId));

  if (post) revalidatePath(`/posts/${post.slug}`);

  return NextResponse.json({ ok: true });
}
