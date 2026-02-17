import { NextRequest } from "next/server";

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateMaps = new Map<string, Map<string, RateEntry>>();

export function checkRateLimit(
  namespace: string,
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  if (!rateMaps.has(namespace)) {
    rateMaps.set(namespace, new Map());
  }
  const map = rateMaps.get(namespace)!;
  const now = Date.now();
  const entry = map.get(key);

  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
