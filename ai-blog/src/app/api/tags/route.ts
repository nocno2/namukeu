import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function GET() {
  const tags = await db.select().from(schema.tags);
  return NextResponse.json(tags);
}
