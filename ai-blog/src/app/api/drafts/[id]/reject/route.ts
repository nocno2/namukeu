import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthError } from "@/lib/auth";

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/drafts/:id/reject - 초안 반려
export async function POST(request: NextRequest, ctx: Ctx) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }

  const { id } = await ctx.params;
  const body = await request.json();

  const draft = await db
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.id, parseInt(id)))
    .get();

  if (!draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(schema.drafts)
    .set({
      status: "rejected",
      rejectReason: body.reason || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.drafts.id, parseInt(id)));

  return NextResponse.json({ ok: true });
}
