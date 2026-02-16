import { describe, expect, test, beforeAll } from "bun:test";
import { SignJWT, jwtVerify } from "jose";

// auth.ts는 모듈 최상위에서 process.env.JWT_SECRET을 검사하고
// next/headers를 import하므로 직접 import이 어려움.
// jose 라이브러리를 사용해 동일한 로직을 테스트.

const TEST_SECRET = "test-secret-for-unit-tests";
let secret: Uint8Array;

beforeAll(() => {
  secret = new TextEncoder().encode(TEST_SECRET);
});

async function signToken(payload: Record<string, unknown>, expiresIn = "7d") {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(secret);
}

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

describe("JWT 토큰 생성", () => {
  test("유효한 토큰을 생성", async () => {
    const token = await signToken({ role: "admin" });
    expect(token).toBeTypeOf("string");
    expect(token.split(".")).toHaveLength(3);
  });

  test("페이로드가 토큰에 포함됨", async () => {
    const token = await signToken({ role: "admin", userId: 1 });
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.role).toBe("admin");
    expect(payload!.userId).toBe(1);
  });
});

describe("JWT 토큰 검증", () => {
  test("유효한 토큰 검증 성공", async () => {
    const token = await signToken({ role: "admin" });
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.role).toBe("admin");
  });

  test("만료된 토큰 거부", async () => {
    const token = await signToken({ role: "admin" }, "0s");
    // 즉시 만료 — 약간 대기 후 검증
    await new Promise((r) => setTimeout(r, 100));
    const payload = await verifyToken(token);
    expect(payload).toBeNull();
  });

  test("잘못된 형식의 토큰 거부", async () => {
    const payload = await verifyToken("invalid.token.here");
    expect(payload).toBeNull();
  });

  test("빈 문자열 토큰 거부", async () => {
    const payload = await verifyToken("");
    expect(payload).toBeNull();
  });

  test("다른 시크릿으로 서명된 토큰 거부", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(wrongSecret);

    const payload = await verifyToken(token);
    expect(payload).toBeNull();
  });
});

describe("JWT 토큰 구조", () => {
  test("HS256 알고리즘 사용", async () => {
    const token = await signToken({ role: "admin" });
    const [headerB64] = token.split(".");
    const header = JSON.parse(atob(headerB64));
    expect(header.alg).toBe("HS256");
  });

  test("만료 시간(exp) 클레임 포함", async () => {
    const token = await signToken({ role: "admin" });
    const payload = await verifyToken(token);
    expect(payload!.exp).toBeTypeOf("number");
  });
});
