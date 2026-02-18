import type { Context } from "grammy";

const MAX_LENGTH = 4000; // Leave buffer under Telegram's 4096 limit

/**
 * Send a response to Telegram, automatically chunking long messages.
 * Uses HTML parse mode (more reliable than legacy Markdown with Claude output).
 */
export async function sendResponse(
  ctx: Context,
  text: string
): Promise<void> {
  if (!text) {
    await sendSafe(ctx, "(empty response)");
    return;
  }

  if (text.length <= MAX_LENGTH) {
    await sendSafe(ctx, text);
    return;
  }

  const chunks = splitPreservingCodeBlocks(text, MAX_LENGTH);
  for (const chunk of chunks) {
    await sendSafe(ctx, chunk);
  }
}

/**
 * Convert Markdown-style formatting to Telegram HTML.
 * Supports: code blocks, inline code, bold, italic, strikethrough, links, headers, lists.
 */
export function markdownToHtml(text: string): string {
  // First, extract code blocks to protect them from other transformations
  const codeBlocks: string[] = [];
  let result = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    const escaped = escapeHtml(code.replace(/\n$/, ""));
    codeBlocks.push(
      lang
        ? `<pre><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>`
        : `<pre><code>${escaped}</code></pre>`
    );
    return `\x00CODEBLOCK_${idx}\x00`;
  });

  // Extract inline code
  const inlineCodes: string[] = [];
  result = result.replace(/`([^`\n]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINE_${idx}\x00`;
  });

  // Escape HTML entities in remaining text
  result = escapeHtml(result);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  result = result.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* or _text_ (but not mid-word underscores like file_name)
  result = result.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "<i>$1</i>");
  result = result.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "<i>$1</i>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Underline: __text__ (already used for bold, but check for specific pattern)
  // Using <u> for underlined text - Telegram supports this
  result = result.replace(/<\s*u\s*>([^<]+)<\s*\/u\s*>/gi, "<u>$1</u>");

  // Links: [text](url) -> <a href="url">text</a>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeUrl = escapeHtml(url).replace(/&amp;/g, "&");
    return `<a href="${safeUrl}">${label}</a>`;
  });

  // Headers: ### H3, ## H2, # H1
  result = result.replace(/^### (.+)$/gm, "<b>$1</b>");
  result = result.replace(/^## (.+)$/gm, "<b>$1</b>");
  result = result.replace(/^# (.+)$/gm, "<b>$1</b>");

  // Unordered lists: - item or * item
  result = result.replace(/^[\-\*] (.+)$/gm, "• $1");

  // Ordered lists: 1. item
  result = result.replace(/^\d+\. (.+)$/gm, "▫️ $1");

  // Restore inline code
  result = result.replace(/\x00INLINE_(\d+)\x00/g, (_m, idx) => inlineCodes[parseInt(idx)]);

  // Restore code blocks
  result = result.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_m, idx) => codeBlocks[parseInt(idx)]);

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Try sending with HTML parse mode, fall back to plain text.
 */
async function sendSafe(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(markdownToHtml(text), { parse_mode: "HTML" });
  } catch {
    try {
      await ctx.reply(text);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }
}

/**
 * Split text at natural boundaries while preserving code block integrity.
 */
function splitPreservingCodeBlocks(
  text: string,
  maxLen: number
): string[] {
  const rawChunks = splitMessage(text, maxLen - 20); // Reserve space for fence markers
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";

  for (const chunk of rawChunks) {
    let processed = chunk;

    // If continuing a code block from previous chunk, re-open it
    if (inCodeBlock) {
      processed = "```" + codeBlockLang + "\n" + processed;
    }

    // Count code fences to track open/close state
    const fences = processed.match(/```/g) || [];
    if (fences.length % 2 !== 0) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        // Extract language from the opening fence
        const lastFenceIdx = processed.lastIndexOf("```");
        const afterFence = processed.substring(lastFenceIdx + 3);
        const langMatch = afterFence.match(/^(\w*)/);
        codeBlockLang = langMatch?.[1] || "";
        // Close the code block at the end of this chunk
        processed += "\n```";
      }
    }

    result.push(processed);
  }

  return result;
}

function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Split at natural boundaries (priority order)
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt <= 0) splitAt = maxLen;

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}
