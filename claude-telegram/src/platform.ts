import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { PlatformAdapter } from "@namukeu/agent-core";
import { sendResponse } from "./message";

// Match approval notification: extract 8-char task ID from /approve <id>
const APPROVE_PATTERN = /실행하려면 \/approve ([a-f0-9]{8})$/;

/**
 * Create a Telegram platform adapter for the agent-core heartbeat system.
 */
export function createTelegramAdapter(bot: Bot): PlatformAdapter {
  return {
    name: "telegram",
    maxMessageLength: 4000,

    async sendMessage(chatId: string, text: string): Promise<void> {
      const numericChatId = parseInt(chatId, 10);
      if (!text) return;

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
          await bot.api.sendMessage(numericChatId, cleanText, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          });
        } catch {
          await bot.api.sendMessage(numericChatId, cleanText, {
            reply_markup: keyboard,
          }).catch((err) => console.error("[platform] Failed to send approval message:", err));
        }
        return;
      }

      // Split long messages
      if (text.length <= 4000) {
        try {
          await bot.api.sendMessage(numericChatId, text, {
            parse_mode: "Markdown",
          });
        } catch {
          try {
            await bot.api.sendMessage(numericChatId, text);
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
        for (const chunk of chunks) {
          try {
            await bot.api.sendMessage(numericChatId, chunk, {
              parse_mode: "Markdown",
            });
          } catch {
            await bot.api.sendMessage(numericChatId, chunk).catch(() => {});
          }
        }
      }
    },

    async sendTyping(chatId: string): Promise<() => void> {
      const numericChatId = parseInt(chatId, 10);
      bot.api.sendChatAction(numericChatId, "typing").catch(() => {});
      const interval = setInterval(() => {
        bot.api.sendChatAction(numericChatId, "typing").catch(() => {});
      }, 4000);
      return () => clearInterval(interval);
    },
  };
}
