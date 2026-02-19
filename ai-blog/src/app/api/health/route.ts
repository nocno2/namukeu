import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// GET /api/health
export async function GET() {
  const start = Date.now();

  try {
    // DB 연결 확인
    await db.select().from(schema.posts).limit(1);

    const responseTime = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database: "ok",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
