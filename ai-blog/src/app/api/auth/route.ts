import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

// 로그인 rate limiting: IP당 15분에 5회
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15분

function checkLoginRate(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkLoginRate(ip)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 }
    );
  }

  const { username, password } = await request.json();

  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPasswordHashB64 = process.env.ADMIN_PASSWORD_HASH || "";
  const adminPasswordHash = adminPasswordHashB64 ? Buffer.from(adminPasswordHashB64, "base64").toString("utf-8") : "";

  if (!adminPasswordHash || username !== adminUsername || !(await bcrypt.compare(password, adminPasswordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signToken({ sub: username, role: "admin" });

  const cookieStore = await cookies();
  cookieStore.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("token");
  return NextResponse.json({ ok: true });
}
