import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthError } from "@/lib/auth";
import { syncPostTags } from "@/lib/tags";

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/drafts/:id/approve - 초안 승인 → 블로그 게시
export async function POST(_request: NextRequest, ctx: Ctx) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }

  const { id } = await ctx.params;
  const draft = await db
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.id, parseInt(id)))
    .get();

  if (!draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (draft.status !== "reviewed") {
    return NextResponse.json(
      { error: "Only reviewed drafts can be approved" },
      { status: 400 }
    );
  }

  // 최종 콘텐츠 (수정된 버전 우선)
  const finalContent = draft.revisedContent || draft.content;

  if (!finalContent || !draft.title || !draft.slug) {
    return NextResponse.json(
      { error: "Draft is missing required fields" },
      { status: 400 }
    );
  }

  // 본문에서 첫 번째 이미지 URL 추출
  const imageMatch = finalContent.match(/!\[.*?\]\(([^)]+)\)/);
  const featuredImage = imageMatch ? imageMatch[1] : null;

  // posts 테이블에 삽입
  const [post] = await db
    .insert(schema.posts)
    .values({
      title: draft.title,
      slug: draft.slug,
      content: finalContent,
      excerpt: draft.excerpt || null,
      categoryId: draft.categoryId || null,
      featuredImage,
      status: "published",
      publishedAt: new Date().toISOString(),
    })
    .returning();

  // 태그 동기화
  if (draft.tags) {
    try {
      const tagNames = JSON.parse(draft.tags);
      if (Array.isArray(tagNames) && tagNames.length > 0) {
        await syncPostTags(post.id, tagNames);
      }
    } catch {}
  }

  // draft 상태 업데이트
  await db
    .update(schema.drafts)
    .set({
      status: "published",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, parseInt(id)));

  return NextResponse.json({ ok: true, postId: post.id, slug: post.slug });
}
