import { NextRequest, NextResponse } from "next/server";
import { getCookie } from "cookies-next";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { amount, description } = body;

    if (!amount || typeof amount !== "number") {
      return NextResponse.json({ error: "유효한 금액을 입력하세요" }, { status: 400 });
    }

    // Simple file-based storage for revenue
    const fs = await import("fs/promises");
    const path = await import("path");
    const dataDir = path.join(process.cwd(), "data");
    const revenueFile = path.join(dataDir, "revenue-manual.json");

    // Ensure data directory exists
    await fs.mkdir(dataDir, { recursive: true });

    // Read existing data
    let revenueData: { records: { date: string; amount: number; description?: string }[] } = {
      records: [],
    };
    try {
      const existing = await fs.readFile(revenueFile, "utf-8");
      revenueData = JSON.parse(existing);
    } catch {
      // File doesn't exist, use default
    }

    // Add new record
    const today = new Date().toISOString().split("T")[0];
    revenueData.records.push({
      date: today,
      amount,
      description: description || "AdSense",
    });

    // Save
    await fs.writeFile(revenueFile, JSON.stringify(revenueData, null, 2));

    return NextResponse.json({
      success: true,
      message: `₩${amount.toLocaleString()} 수익이 추가되었습니다`,
    });
  } catch (error) {
    console.error("[revenue] Error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const revenueFile = path.join(process.cwd(), "data", "revenue-manual.json");

    let revenueData = { records: [] };
    try {
      const existing = await fs.readFile(revenueFile, "utf-8");
      revenueData = JSON.parse(existing);
    } catch {
      // File doesn't exist
    }

    return NextResponse.json(revenueData);
  } catch (error) {
    console.error("[revenue] Error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
