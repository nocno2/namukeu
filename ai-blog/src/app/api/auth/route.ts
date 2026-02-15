import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
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
