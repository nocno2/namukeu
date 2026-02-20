import { describe, expect, test } from "bun:test";
import { generatePostMetadata, generateJsonLd, generateWebSiteJsonLd } from "../seo";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "AI Blog";

describe("generatePostMetadata", () => {
  const basePost = {
    title: "테스트 글 제목",
    slug: "test-post",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  test("기본 메타데이터 생성", () => {
    const meta = generatePostMetadata(basePost);
    expect(meta.title).toBe("테스트 글 제목");
    expect(meta.description).toBe("");
  });

  test("metaTitle이 있으면 title 대신 사용", () => {
    const meta = generatePostMetadata({
      ...basePost,
      metaTitle: "SEO 최적화 제목",
    });
    expect(meta.title).toBe("SEO 최적화 제목");
  });

  test("metaDescription이 있으면 excerpt 대신 사용", () => {
    const meta = generatePostMetadata({
      ...basePost,
      excerpt: "발췌문",
      metaDescription: "메타 설명",
    });
    expect(meta.description).toBe("메타 설명");
  });

  test("metaDescription이 없으면 excerpt로 fallback", () => {
    const meta = generatePostMetadata({
      ...basePost,
      excerpt: "발췌문 fallback",
    });
    expect(meta.description).toBe("발췌문 fallback");
  });

  test("excerpt도 없으면 빈 문자열", () => {
    const meta = generatePostMetadata(basePost);
    expect(meta.description).toBe("");
  });

  test("OpenGraph URL 생성", () => {
    const meta = generatePostMetadata(basePost);
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/posts/test-post`);
  });

  test("절대 URL 이미지 그대로 사용", () => {
    const meta = generatePostMetadata({
      ...basePost,
      featuredImage: "https://cdn.example.com/img.jpg",
    });
    const images = meta.openGraph?.images as Array<{ url: string }>;
    expect(images[0].url).toBe("https://cdn.example.com/img.jpg");
  });

  test("상대 URL 이미지에 SITE_URL 접두사 추가", () => {
    const meta = generatePostMetadata({
      ...basePost,
      featuredImage: "/uploads/img.jpg",
    });
    const images = meta.openGraph?.images as Array<{ url: string }>;
    expect(images[0].url).toBe(`${SITE_URL}/uploads/img.jpg`);
  });

  test("이미지 없으면 images 필드 없음", () => {
    const meta = generatePostMetadata(basePost);
    expect(meta.openGraph?.images).toBeUndefined();
  });

  test("publishedAt이 있으면 publishedTime 포함", () => {
    const meta = generatePostMetadata({
      ...basePost,
      publishedAt: "2026-01-15T10:00:00Z",
    });
    expect(meta.openGraph?.publishedTime).toBe("2026-01-15T10:00:00Z");
  });

  test("Twitter card 타입은 summary_large_image", () => {
    const meta = generatePostMetadata(basePost);
    expect(meta.twitter?.card).toBe("summary_large_image");
  });
});

describe("generateJsonLd", () => {
  const basePost = {
    title: "JSON-LD 테스트",
    slug: "jsonld-test",
    updatedAt: "2026-02-01T00:00:00Z",
  };

  test("BlogPosting 타입 생성", () => {
    const ld = generateJsonLd(basePost);
    const blogPosting = Array.isArray(ld) ? ld.find((l) => l["@type"] === "BlogPosting") : ld;
    expect(blogPosting?.["@context"]).toBe("https://schema.org");
    expect(blogPosting?.["@type"]).toBe("BlogPosting");
  });

  test("headline과 URL 포함", () => {
    const ld = generateJsonLd(basePost);
    const blogPosting = Array.isArray(ld) ? ld.find((l) => l["@type"] === "BlogPosting") : ld;
    expect(blogPosting?.headline).toBe("JSON-LD 테스트");
    expect(blogPosting?.url).toBe(`${SITE_URL}/posts/jsonld-test`);
  });

  test("dateModified 포함", () => {
    const ld = generateJsonLd(basePost);
    const blogPosting = Array.isArray(ld) ? ld.find((l) => l["@type"] === "BlogPosting") : ld;
    expect(blogPosting?.dateModified).toBe("2026-02-01T00:00:00Z");
  });

  test("이미지 절대 URL 처리", () => {
    const ld = generateJsonLd({
      ...basePost,
      featuredImage: "https://cdn.example.com/img.jpg",
    });
    const blogPosting = Array.isArray(ld) ? ld.find((l) => l["@type"] === "BlogPosting") : ld;
    expect(blogPosting?.image).toBe("https://cdn.example.com/img.jpg");
  });

  test("이미지 상대 URL 처리", () => {
    const ld = generateJsonLd({
      ...basePost,
      featuredImage: "/uploads/thumb.jpg",
    });
    const blogPosting = Array.isArray(ld) ? ld.find((l) => l["@type"] === "BlogPosting") : ld;
    expect(blogPosting?.image).toBe(`${SITE_URL}/uploads/thumb.jpg`);
  });

  test("author와 publisher 포함", () => {
    const ld = generateJsonLd(basePost);
    const blogPosting = Array.isArray(ld) ? ld.find((l) => l["@type"] === "BlogPosting") : ld;
    expect(blogPosting?.author?.name).toBeDefined();
    expect(blogPosting?.publisher?.name).toBeDefined();
  });

  test("content가 있으면 FAQPage 스키마 추가", () => {
    const ld = generateJsonLd({
      ...basePost,
      content: "## FAQ\nQ: 질문입니다\nA: 답변입니다",
    });
    expect(Array.isArray(ld)).toBe(true);
    const faqPage = ld?.find((l) => l["@type"] === "FAQPage");
    expect(faqPage).toBeDefined();
    expect(faqPage?.mainEntity).toHaveLength(1);
  });
});

describe("generateWebSiteJsonLd", () => {
  test("WebSite 타입 생성", () => {
    const ld = generateWebSiteJsonLd();
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("WebSite");
  });

  test("사이트 이름과 URL 포함", () => {
    const ld = generateWebSiteJsonLd();
    expect(ld.name).toBe(SITE_NAME);
    expect(ld.url).toBe(SITE_URL);
  });

  test("publisher 포함", () => {
    const ld = generateWebSiteJsonLd();
    expect(ld.publisher["@type"]).toBe("Organization");
  });
});
