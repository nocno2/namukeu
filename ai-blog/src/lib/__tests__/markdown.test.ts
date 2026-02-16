import { describe, expect, test } from "bun:test";
import { markdownToHtml } from "../markdown";

describe("markdownToHtml", () => {
  test("기본 마크다운을 HTML로 변환", async () => {
    const html = await markdownToHtml("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("GFM 테이블 지원", async () => {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |`;
    const html = await markdownToHtml(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  test("코드 블록 변환", async () => {
    const md = "```js\nconsole.log('hi');\n```";
    const html = await markdownToHtml(md);
    expect(html).toContain("<code");
    expect(html).toContain("console.log");
  });
});

describe("XSS 방어", () => {
  test("script 태그 제거", async () => {
    const html = await markdownToHtml('<script>alert("xss")</script>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script>");
  });

  test("인라인 이벤트 핸들러 제거", async () => {
    const html = await markdownToHtml('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  test("javascript: URL 제거", async () => {
    const html = await markdownToHtml('[click](javascript:alert(1))');
    expect(html).not.toContain("javascript:");
  });
});

describe("이미지 figure 래핑", () => {
  test("alt 텍스트가 있는 이미지를 figure로 래핑", async () => {
    const md = '![캡션 텍스트](https://example.com/img.jpg)';
    const html = await markdownToHtml(md);
    expect(html).toContain("<figure>");
    expect(html).toContain("<figcaption>캡션 텍스트</figcaption>");
    expect(html).toContain('loading="lazy"');
  });

  test("파이프 구문으로 max-width 적용", async () => {
    const md = '![캡션|400px](https://example.com/img.jpg)';
    const html = await markdownToHtml(md);
    expect(html).toContain('style="max-width:400px"');
    expect(html).toContain("<figcaption>캡션</figcaption>");
  });

  test("alt 텍스트 없는 이미지는 figure 래핑 안 함", async () => {
    const md = '![](https://example.com/img.jpg)';
    const html = await markdownToHtml(md);
    expect(html).not.toContain("<figure>");
  });
});

describe("parseAlt (파이프 파싱)", () => {
  // parseAlt는 직접 export되지 않으므로 markdownToHtml을 통해 간접 테스트
  test("파이프 없는 일반 캡션", async () => {
    const md = '![일반 캡션](https://example.com/img.jpg)';
    const html = await markdownToHtml(md);
    expect(html).toContain("<figcaption>일반 캡션</figcaption>");
    expect(html).not.toContain("style=");
  });

  test("파이프+px 형식으로 크기 지정", async () => {
    const md = '![넓은 이미지|800px](https://example.com/img.jpg)';
    const html = await markdownToHtml(md);
    expect(html).toContain('style="max-width:800px"');
    expect(html).toContain("<figcaption>넓은 이미지</figcaption>");
  });

  test("파이프 있지만 px가 아닌 경우 무시", async () => {
    const md = '![캡션|큰사이즈](https://example.com/img.jpg)';
    const html = await markdownToHtml(md);
    // px 패턴이 아니므로 전체를 캡션으로 처리
    expect(html).toContain("캡션|큰사이즈");
    expect(html).not.toContain('style="max-width');
  });
});

describe("H1 제거", () => {
  test("본문 첫 H1 제거", async () => {
    const md = "# 제목\n\n본문 텍스트";
    const html = await markdownToHtml(md);
    expect(html).not.toContain("<h1>");
    expect(html).toContain("본문 텍스트");
  });

  test("H2는 유지", async () => {
    const md = "## 소제목\n\n내용";
    const html = await markdownToHtml(md);
    expect(html).toContain("<h2>");
  });

  test("첫 번째 H1만 제거, 이후 H1은 유지 가능", async () => {
    const md = "# 첫번째\n\n텍스트\n\n# 두번째";
    const html = await markdownToHtml(md);
    // 첫 H1 제거 후 두 번째 H1은 남아있어야 함
    expect(html).toContain("두번째");
  });
});
