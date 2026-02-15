import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB (원본 허용, 변환 후 줄어듦)
const MAX_WIDTH = 1200;
const WEBP_QUALITY = 80;

export async function POST(request: NextRequest) {
  try { await requireAuth(); } catch (e) {
    if (e instanceof AuthError) return e.response; throw e;
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // MIME 타입 또는 확장자로 이미지 여부 판별
  const ext = file.name.split(".").pop()?.toLowerCase();
  const ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];
  if (!ALLOWED_TYPES.includes(file.type) && (!ext || !ALLOWED_EXTS.includes(ext))) {
    return NextResponse.json(
      { error: "지원하지 않는 형식입니다. JPEG, PNG, GIF, WebP, HEIC 파일만 가능합니다." },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json(
      { error: "파일 크기는 20MB 이하만 가능합니다." },
      { status: 400 }
    );
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  // GIF는 애니메이션 보존을 위해 첫 프레임만 WebP로 변환
  const image = sharp(buffer, { animated: false });
  const metadata = await image.metadata();

  let pipeline = image;

  // 가로가 MAX_WIDTH보다 크면 리사이즈
  if (metadata.width && metadata.width > MAX_WIDTH) {
    pipeline = pipeline.resize(MAX_WIDTH, undefined, { withoutEnlargement: true });
  }

  const optimized = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();

  const { writeFile } = await import("fs/promises");
  await writeFile(path.join(uploadDir, filename), optimized);

  const savedKB = Math.round((buffer.length - optimized.length) / 1024);
  const ratio = Math.round((1 - optimized.length / buffer.length) * 100);

  return NextResponse.json({
    url: `/uploads/${filename}`,
    originalSize: buffer.length,
    optimizedSize: optimized.length,
    saved: savedKB > 0 ? `${savedKB}KB 절약 (${ratio}% 감소)` : undefined,
  }, { status: 201 });
}
