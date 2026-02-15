import type { TextBasedChannel } from "discord.js";

const MAX_LENGTH = 1900; // Leave buffer under Discord's 2000 limit

/**
 * Send a response to Discord, automatically chunking long messages
 * and preserving code block integrity.
 */
export async function sendResponse(
  channel: TextBasedChannel,
  text: string
): Promise<void> {
  if (!text) {
    await sendSafe(channel, "(empty response)");
    return;
  }

  if (text.length <= MAX_LENGTH) {
    await sendSafe(channel, text);
    return;
  }

  const chunks = splitPreservingCodeBlocks(text, MAX_LENGTH);
  for (const chunk of chunks) {
    await sendSafe(channel, chunk);
  }
}

/**
 * Send a message to Discord. Discord natively renders Markdown.
 */
async function sendSafe(channel: TextBasedChannel, text: string): Promise<void> {
  try {
    await channel.send(text);
  } catch (err) {
    console.error("Failed to send message:", err);
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
