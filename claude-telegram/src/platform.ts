import type { Bot } from "grammy";
import type { PlatformAdapter } from "@namukeu/agent-core";
import { sendResponse } from "./message";

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
