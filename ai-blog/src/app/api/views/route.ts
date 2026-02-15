import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql, gte } from "drizzle-orm";
import { requireAuth, AuthError } from "@/lib/auth";

// 간단한 in-memory rate limit (IP당 분당 30회)
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000; // 1분

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// POST /api/views - 페이지뷰 기록
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json();
  const { slug } = body;

  if (!slug || typeof slug !== "string" || slug.length > 200) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  // 해당 slug의 post 찾기
  const post = await db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(eq(schema.posts.slug, slug))
    .get();

  const referrer = request.headers.get("referer") || null;
  const userAgent = request.headers.get("user-agent") || null;

  await db.insert(schema.pageViews).values({
    postId: post?.id || null,
    slug,
    referrer,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}

// GET /api/views - 통계 (관리자 전용)
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (slug) {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.pageViews)
      .where(eq(schema.pageViews.slug, slug));

    return NextResponse.json({ slug, views: result.count });
  }

  // 전체 통계: 글별 조회수 (상위 20개)
  const stats = await db
    .select({
      slug: schema.pageViews.slug,
      postTitle: schema.posts.title,
      views: sql<number>`count(*)`,
    })
    .from(schema.pageViews)
    .leftJoin(schema.posts, eq(schema.pageViews.postId, schema.posts.id))
    .groupBy(schema.pageViews.slug)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  // 오늘 총 조회수
  const today = new Date().toISOString().split("T")[0];
  const [todayResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.pageViews)
    .where(gte(schema.pageViews.createdAt, today));

  // 전체 총 조회수
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.pageViews);

  return NextResponse.json({
    today: todayResult.count,
    total: totalResult.count,
    posts: stats,
  });
}
