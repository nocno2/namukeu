import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

// sanitize 스키마: 기본 + style 속성 허용 (이미지 max-width용) + figure/figcaption 허용
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), "style", "loading"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
  },
  tagNames: [...(defaultSchema.tagNames || []), "figure", "figcaption"],
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

/** Parse alt text for optional size: "캡션|400px" → { caption: "캡션", maxWidth: "400px" } */
function parseAlt(alt: string): { caption: string; maxWidth?: string } {
  const match = alt.match(/^(.+?)\|(\d+px)$/);
  if (match) return { caption: match[1].trim(), maxWidth: match[2] };
  return { caption: alt };
}

/** Wrap standalone <img> with alt text in <figure>+<figcaption> */
function wrapImagesInFigure(html: string): string {
  return html.replace(
    /<p>\s*<img src="([^"]*)" alt="([^"]+)"([^>]*)>\s*<\/p>/g,
    (_match, src, alt, rest) => {
      const { caption, maxWidth } = parseAlt(alt);
      const style = maxWidth ? ` style="max-width:${maxWidth}"` : "";
      return `<figure><img src="${src}" alt="${caption}"${style} loading="lazy"><figcaption>${caption}</figcaption></figure>`;
    }
  );
}

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

/** 한글/영문 호환 slugify */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** h2, h3에 id 속성 추가 */
function addHeadingIds(html: string): string {
  const usedIds = new Set<string>();
  return html.replace(/<(h[23])>(.*?)<\/\1>/g, (_match, tag, content) => {
    const text = content.replace(/<[^>]*>/g, "");
    let id = slugify(text);
    if (!id) id = "heading";
    if (usedIds.has(id)) {
      let i = 1;
      while (usedIds.has(`${id}-${i}`)) i++;
      id = `${id}-${i}`;
    }
    usedIds.add(id);
    return `<${tag} id="${id}">${content}</${tag}>`;
  });
}

/** HTML에서 h2, h3 헤딩 목록 추출 (TOC용) */
export function extractHeadings(html: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const pattern = /<h([23]) id="([^"]+)">(.*?)<\/h\1>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    headings.push({
      level: parseInt(m[1]),
      id: m[2],
      text: m[3].replace(/<[^>]*>/g, ""),
    });
  }
  return headings;
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await processor.process(markdown);
  let html = result.toString();
  // 본문 첫 H1 제거 (페이지 header와 중복 방지)
  html = html.replace(/^<h1>.*?<\/h1>\n?/, "");
  html = wrapImagesInFigure(html);
  html = addHeadingIds(html);
  return html;
}
