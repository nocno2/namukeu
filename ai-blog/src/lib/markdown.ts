import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkHtml, { sanitize: false });

/** Wrap standalone <img> with alt text in <figure>+<figcaption> */
function wrapImagesInFigure(html: string): string {
  return html.replace(
    /<p>\s*<img src="([^"]*)" alt="([^"]+)"[^>]*>\s*<\/p>/g,
    (_match, src, alt) =>
      `<figure><img src="${src}" alt="${alt}" loading="lazy"><figcaption>${alt}</figcaption></figure>`
  );
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await processor.process(markdown);
  return wrapImagesInFigure(result.toString());
}
