import { describe, expect, test } from "bun:test";
import { slugify } from "../utils";

describe("slugify", () => {
  test("영문을 소문자로 변환", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("한글 유지", () => {
    expect(slugify("인공지능")).toBe("인공지능");
  });

  test("한글+영문 혼합", () => {
    expect(slugify("AI 인공지능 Guide")).toBe("ai-인공지능-guide");
  });

  test("특수문자 제거", () => {
    expect(slugify("hello! @world# $test")).toBe("hello-world-test");
  });

  test("연속 공백/언더스코어를 하이픈 하나로", () => {
    expect(slugify("hello   world")).toBe("hello-world");
    expect(slugify("hello___world")).toBe("hello-world");
    expect(slugify("hello _ world")).toBe("hello-world");
  });

  test("앞뒤 하이픈 제거", () => {
    expect(slugify("-hello-world-")).toBe("hello-world");
    expect(slugify("  hello  ")).toBe("hello");
  });

  test("빈 문자열 처리", () => {
    expect(slugify("")).toBe("");
  });

  test("특수문자만 있는 경우", () => {
    expect(slugify("!@#$%")).toBe("");
  });

  test("숫자 유지", () => {
    expect(slugify("Top 10 AI Tools")).toBe("top-10-ai-tools");
  });

  test("하이픈 포함 텍스트", () => {
    expect(slugify("next-js tutorial")).toBe("next-js-tutorial");
  });

  test("대문자 한글+특수문자 복합", () => {
    expect(slugify("AI & 머신러닝: 2024 가이드")).toBe("ai-머신러닝-2024-가이드");
  });
});
