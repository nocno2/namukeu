import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { PlatformAdapter } from "@namukeu/agent-core";
import { sendResponse, markdownToHtml } from "./message";

// Environment
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID ? parseInt(process.env.LOG_CHANNEL_ID, 10) : null;

// Match approval notification: extract 8-char task ID from /approve <id>
const APPROVE_PATTERN = /실행하려면 \/approve ([a-f0-9]{8})$/;

// Log message pattern - messages starting with [LOG] will be auto-deleted after 5 minutes
// No tag = never deleted (safe by default)
const LOG_PATTERN = /^\[LOG\]/;

// Check if message is a log message (must start with [LOG])
function isLogMessage(text: string): boolean {
  return LOG_PATTERN.test(text.trim());
}

// Store pending deletions: messageId -> timeout
const pendingDeletions = new Map<number, NodeJS.Timeout>();

// Auto-delete message after delay (default 5 minutes)
async function scheduleDeletion(chatId: number, messageId: number, delayMs = 5 * 60 * 1000): Promise<void> {
  // Cancel any existing deletion for this message
  const existing = pendingDeletions.get(messageId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    try {
      await bot.api.deleteMessage(chatId, messageId);
    } catch {
      // Ignore deletion errors (message might already be deleted)
    }
    pendingDeletions.delete(messageId);
  }, delayMs);

  pendingDeletions.set(messageId, timeout);
}

/**
 * Create a Telegram platform adapter for the agent-core heartbeat system.
 */
export function createTelegramAdapter(bot: Bot): PlatformAdapter {
  return {
    name: "telegram",
    maxMessageLength: 4000,

    async sendMessage(chatId: string, text: string): Promise<void> {
      if (!text) return;

      const isLog = isLogMessage(text);
      // Send log messages to separate channel if configured
      const targetChatId = isLog && LOG_CHANNEL_ID ? LOG_CHANNEL_ID : parseInt(chatId, 10);

      // Auto-attach inline buttons to approval notifications
      const approveMatch = text.match(APPROVE_PATTERN);
      if (approveMatch) {
        const taskIdPrefix = approveMatch[1];
        const keyboard = new InlineKeyboard()
          .text("✓ 승인", `app_${taskIdPrefix}`)
          .text("✗ 거절", `rej_${taskIdPrefix}`);
        // Strip the /approve instruction from message text
        const cleanText = text.replace(/\n실행하려면 \/approve [a-f0-9]{8}$/, "");
        try {
          const msg = await bot.api.sendMessage(targetChatId, markdownToHtml(cleanText), {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          if (isLog) scheduleDeletion(targetChatId, msg.message_id);
        } catch {
          try {
            const msg = await bot.api.sendMessage(targetChatId, cleanText, {
              reply_markup: keyboard,
            });
            if (isLog) scheduleDeletion(targetChatId, msg.message_id);
          } catch (err) {
            console.error("[platform] Failed to send approval message:", err);
          }
        }
        return;
      }

      // Split long messages
      if (text.length <= 4000) {
        try {
          const msg = await bot.api.sendMessage(targetChatId, markdownToHtml(text), {
            parse_mode: "HTML",
          });
          if (isLog) scheduleDeletion(targetChatId, msg.message_id);
        } catch {
          try {
            const msg = await bot.api.sendMessage(targetChatId, text);
            if (isLog) scheduleDeletion(targetChatId, msg.message_id);
          } catch (err) {
            console.error("[platform] Failed to send message:", err);
          }
        }
      } else {
        // Chunk long messages
        const chunks: string[] = [];
        let remaining = text;
        while (remaining.length > 0) {
          if (remaining.length <= 4000) {
            chunks.push(remaining);
            break;
          }
          let splitAt = remaining.lastIndexOf("\n\n", 4000);
          if (splitAt <= 0) splitAt = remaining.lastIndexOf("\n", 4000);
          if (splitAt <= 0) splitAt = 4000;
          chunks.push(remaining.substring(0, splitAt));
          remaining = remaining.substring(splitAt).trimStart();
        }
        for (let i = 0; i < chunks.length; i++) {
          try {
            const msg = await bot.api.sendMessage(targetChatId, markdownToHtml(chunks[i]), {
              parse_mode: "HTML",
            });
            // Only schedule deletion for first chunk of log messages
            if (i === 0 && isLog) scheduleDeletion(targetChatId, msg.message_id);
          } catch {
            try {
              const msg = await bot.api.sendMessage(targetChatId, chunks[i]);
              if (i === 0 && isLog) scheduleDeletion(targetChatId, msg.message_id);
            } catch {
              // Ignore chunk errors
            }
          }
        }
      }
    },

    async sendTyping(chatId: string): Promise<() => void> {
      const targetChatId = parseInt(chatId, 10);
      bot.api.sendChatAction(targetChatId, "typing").catch(() => {});
      const interval = setInterval(() => {
        bot.api.sendChatAction(targetChatId, "typing").catch(() => {});
      }, 4000);
      return () => clearInterval(interval);
    },
  };
}
