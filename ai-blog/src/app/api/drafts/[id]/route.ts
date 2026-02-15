import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthError } from "@/lib/auth";
import { markdownToHtml } from "@/lib/markdown";

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/drafts/:id
export async function GET(_request: NextRequest, ctx: Ctx) {
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

  const finalContent = draft.revisedContent || draft.content || "";
  const contentHtml = finalContent ? await markdownToHtml(finalContent) : "";

  return NextResponse.json({ ...draft, contentHtml });
}

// PUT /api/drafts/:id - 초안 수정
export async function PUT(request: NextRequest, ctx: Ctx) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }

  const { id } = await ctx.params;
  const body = await request.json();

  const existing = await db
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.id, parseInt(id)))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await db
    .update(schema.drafts)
    .set({
      ...body,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, parseInt(id)))
    .returning();

  return NextResponse.json(result[0]);
}
