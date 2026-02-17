import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, count, sql } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// GET /api/likes?postId=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const postId = Number(searchParams.get("postId"));
  const ip = getClientIp(request);

  if (!postId || isNaN(postId)) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.postLikes)
    .where(eq(schema.postLikes.postId, postId));

  const existing = await db
    .select({ id: schema.postLikes.id })
    .from(schema.postLikes)
    .where(and(eq(schema.postLikes.postId, postId), eq(schema.postLikes.ipAddress, ip)))
    .get();

  return NextResponse.json({ count: total, liked: !!existing });
}

// POST /api/likes — 좋아요 토글
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (!checkRateLimit("like-toggle", ip, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { postId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const postId = Number(body.postId);
  if (!postId || isNaN(postId)) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  const existing = await db
    .select({ id: schema.postLikes.id })
    .from(schema.postLikes)
    .where(and(eq(schema.postLikes.postId, postId), eq(schema.postLikes.ipAddress, ip)))
    .get();

  let liked: boolean;
  if (existing) {
    await db
      .delete(schema.postLikes)
      .where(and(eq(schema.postLikes.postId, postId), eq(schema.postLikes.ipAddress, ip)));
    liked = false;
  } else {
    try {
      await db.insert(schema.postLikes).values({ postId, ipAddress: ip });
      liked = true;
    } catch {
      // UNIQUE 제약 위반 (동시 요청) — 이미 좋아요 상태로 처리
      liked = true;
    }
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.postLikes)
    .where(eq(schema.postLikes.postId, postId));

  return NextResponse.json({ count: total, liked });
}
