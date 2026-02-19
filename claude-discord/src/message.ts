import type { TextBasedChannel, GuildTextBasedChannel, Message } from "discord.js";

const MAX_LENGTH = 1900; // Leave buffer under Discord's 2000 limit

// Log message pattern - messages starting with [LOG] will be auto-deleted after 5 minutes
// No tag = never deleted (safe by default)
const LOG_PATTERN = /^\[LOG\]/;

// Check if message is a log message (must start with [LOG])
function isLogMessage(text: string): boolean {
  return LOG_PATTERN.test(text.trim());
}

// Store pending deletions: messageId -> timeout
const pendingDeletions = new Map<string, NodeJS.Timeout>();

// Auto-delete message after delay (default 5 minutes)
async function scheduleDeletion(message: Message, delayMs = 5 * 60 * 1000): Promise<void> {
  const key = `${message.channelId}-${message.id}`;
  // Cancel any existing deletion for this message
  const existing = pendingDeletions.get(key);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    try {
      await message.delete();
    } catch {
      // Ignore deletion errors
    }
    pendingDeletions.delete(key);
  }, delayMs);

  pendingDeletions.set(key, timeout);
}

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

  const isLog = isLogMessage(text);

  if (text.length <= MAX_LENGTH) {
    const msg = await sendSafe(channel, text);
    if (isLog && msg) scheduleDeletion(msg);
    return;
  }

  const chunks = splitPreservingCodeBlocks(text, MAX_LENGTH);
  for (let i = 0; i < chunks.length; i++) {
    const msg = await sendSafe(channel, chunks[i]);
    // Only schedule deletion for first chunk of log messages
    if (i === 0 && isLog && msg) scheduleDeletion(msg);
  }
}

/**
 * Send a message to Discord. Discord natively renders Markdown.
 * Returns the sent message for tracking, or null if failed.
 */
async function sendSafe(channel: TextBasedChannel, text: string): Promise<Message | null> {
  try {
    const msg = await channel.send(text);
    return msg;
  } catch (err) {
    console.error("Failed to send message:", err);
    return null;
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
