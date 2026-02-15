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

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await processor.process(markdown);
  let html = result.toString();
  // 본문 첫 H1 제거 (페이지 header와 중복 방지)
  html = html.replace(/^<h1>.*?<\/h1>\n?/, "");
  return wrapImagesInFigure(html);
}
