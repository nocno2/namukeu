import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, AuthError } from "@/lib/auth";

// GET /api/drafts - 초안 목록 (관리자 전용)
export async function GET(request: NextRequest) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const conditions = [];
  if (status) {
    conditions.push(eq(schema.drafts.status, status as "researched" | "written" | "reviewed" | "approved" | "published" | "rejected"));
  }

  const where = conditions.length > 0 ? conditions[0] : undefined;

  const drafts = await db
    .select()
    .from(schema.drafts)
    .where(where)
    .orderBy(desc(schema.drafts.createdAt));

  return NextResponse.json({ drafts });
}
