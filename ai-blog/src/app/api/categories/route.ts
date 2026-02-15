import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function GET() {
  const categories = await db.select().from(schema.categories);
  return NextResponse.json(categories);
}
