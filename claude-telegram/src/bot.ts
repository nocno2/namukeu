import { Bot, type Context } from "grammy";
import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { callClaude } from "./claude";
import { SessionTracker } from "./session";
import {
  processMemoryTags,
  getMemoryContext,
  getMemorySummary,
  getMemoryDetail,
  clearMemory,
} from "./memory";
import { sendResponse } from "./message";
import { MessageQueue } from "./queue";
import {
  initDb,
  saveMessage,
  getRecentMessages,
  searchMessages,
  getMessageCount,
} from "./db";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ALLOWED_USER_ID = parseInt(process.env.TELEGRAM_USER_ID!, 10);
const USER_NAME = process.env.USER_NAME || "";
const USER_TIMEZONE = process.env.USER_TIMEZONE || "Asia/Seoul";
const UPLOADS_DIR = join(import.meta.dir, "..", "uploads");

let profileContext = "";

const startTime = Date.now();

async function loadProfile(): Promise<void> {
  try {
    profileContext = await readFile(
      join(import.meta.dir, "..", "config", "profile.md"),
      "utf-8"
    );
  } catch {
    console.log("No profile.md found, running without profile context.");
  }
}

function buildSystemPrompt(memoryContext: string): string {
  const parts: string[] = [];

  parts.push(
    "You are a personal AI assistant responding via Telegram."
  );
  parts.push(
    "Keep responses concise and conversational. Use the same language as the user."
  );
  parts.push(
    "You have full agent capabilities: read/write files, run commands, search the web."
  );

  if (USER_NAME) parts.push(`You are speaking with ${USER_NAME}.`);

  const timeStr = new Date().toLocaleString("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  parts.push(`Current time: ${timeStr}`);

  if (profileContext) parts.push(`\nProfile:\n${profileContext}`);
  if (memoryContext) parts.push(`\n${memoryContext}`);

  parts.push(
    "\nMEMORY MANAGEMENT:" +
      "\nWhen the user shares something worth remembering, sets goals, or completes goals, " +
      "include these tags in your response (they are processed automatically and hidden from the user):" +
      "\n[REMEMBER: fact to store]" +
      "\n[GOAL: goal text | DEADLINE: optional date]" +
      "\n[DONE: search text for completed goal]"
  );

  parts.push(
    "\nPROGRESS REPORTING:" +
      "\nThe user communicates via Telegram and cannot see your intermediate work." +
      "\nFor tasks taking more than 2 minutes, include [PROGRESS: brief status] tags periodically." +
      "\nThese are sent to the user as real-time updates and stripped from the final response." +
      "\nExamples: [PROGRESS: 프로젝트 구조 분석 중], [PROGRESS: API 3/5개 구현 완료]"
  );

  return parts.join("\n");
}

function buildResumePrefix(): string {
  const timeStr = new Date().toLocaleString("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `[Current time: ${timeStr}]`;
}

function startTypingIndicator(ctx: Context): () => void {
  ctx.replyWithChatAction("typing").catch(() => {});
  const interval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);
  return () => clearInterval(interval);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: USER_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function createBot(): Promise<Bot> {
  await loadProfile();
  initDb();

  const bot = new Bot(BOT_TOKEN);
  const sessions = new SessionTracker();
  await sessions.load();
  const queue = new MessageQueue();

  // --- Auth middleware ---
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== ALLOWED_USER_ID) {
      return;
    }
    await next();
  });

  // --- Commands ---

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Claude Telegram Relay v2 is running.\n" +
        "Send me a message and I'll respond using Claude Code.\n\n" +
        "Commands:\n" +
        "/reset — Start a new conversation\n" +
        "/status — Show bot status\n" +
        "/memory — Show stored memories\n" +
        "/forget — Clear all memories\n" +
        "/history — Recent conversation history\n" +
        "/search <query> — Search past messages"
    );
  });

  bot.command("reset", async (ctx) => {
    const chatId = ctx.chat.id;
    await sessions.resetSession(chatId);
    await ctx.reply("세션이 초기화되었습니다. 새로운 대화를 시작합니다.");
    console.log(`Session reset for chat ${chatId}`);
  });

  bot.command("status", async (ctx) => {
    const chatId = ctx.chat.id;
    const session = sessions.getSession(chatId);
    const memorySummary = await getMemorySummary();
    const msgCount = getMessageCount(chatId);
    const uptime = (Date.now() - startTime) / 1000;

    const lines = [
      "Bot Status",
      `Session: ${session ? session.sessionId.slice(0, 8) + "..." : "none"}`,
      `Session messages: ${session?.messageCount || 0}`,
      `Total messages (DB): ${msgCount}`,
      `Generation: ${session?.generation || 0}`,
      `Memory: ${memorySummary}`,
      `Uptime: ${formatUptime(uptime)}`,
    ];

    await ctx.reply(lines.join("\n"));
  });

  bot.command("memory", async (ctx) => {
    const detail = await getMemoryDetail();
    await sendResponse(ctx, detail);
  });

  bot.command("forget", async (ctx) => {
    await clearMemory();
    await ctx.reply("모든 기억이 삭제되었습니다.");
  });

  bot.command("history", async (ctx) => {
    const chatId = ctx.chat.id;
    const limitStr = ctx.match?.trim();
    const limit = Math.min(parseInt(limitStr || "10", 10) || 10, 50);

    const messages = getRecentMessages(chatId, limit);
    if (messages.length === 0) {
      await ctx.reply("No conversation history yet.");
      return;
    }

    // Messages come in DESC order, reverse to show chronologically
    const lines = messages.reverse().map((m) => {
      const time = formatTimestamp(m.created_at);
      const role = m.role === "user" ? "You" : "Claude";
      const content =
        m.content.length > 150 ? m.content.slice(0, 150) + "..." : m.content;
      return `[${time}] ${role}: ${content}`;
    });

    const total = getMessageCount(chatId);
    const header = `Recent ${messages.length} of ${total} messages:\n\n`;
    await sendResponse(ctx, header + lines.join("\n\n"));
  });

  bot.command("search", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Usage: /search <keyword>\nExample: /search GitHub");
      return;
    }

    const chatId = ctx.chat.id;
    const messages = searchMessages(chatId, query, 10);

    if (messages.length === 0) {
      await ctx.reply(`No messages found matching "${query}".`);
      return;
    }

    const lines = messages.map((m) => {
      const time = formatTimestamp(m.created_at);
      const role = m.role === "user" ? "You" : "Claude";
      const content =
        m.content.length > 200 ? m.content.slice(0, 200) + "..." : m.content;
      return `[${time}] ${role}: ${content}`;
    });

    await sendResponse(
      ctx,
      `Found ${messages.length} messages matching "${query}":\n\n` +
        lines.join("\n\n")
    );
  });

  // --- Message handlers ---

  async function processMessage(
    ctx: Context,
    prompt: string
  ): Promise<void> {
    const chatId = ctx.chat!.id;

    await queue.enqueue(chatId, async () => {
      const stopTyping = startTypingIndicator(ctx);

      try {
        // Save user message to DB
        saveMessage(chatId, "user", prompt);

        const isNew = sessions.isNewSession(chatId);
        const sessionId = sessions.getSessionId(chatId);

        let finalPrompt: string;
        let systemPrompt: string | undefined;

        if (isNew) {
          const memoryContext = await getMemoryContext();
          systemPrompt = buildSystemPrompt(memoryContext);
          finalPrompt = prompt;
        } else {
          const prefix = buildResumePrefix();
          finalPrompt = `${prefix}\n\n${prompt}`;
        }

        const result = await callClaude(finalPrompt, {
          sessionId,
          isNewSession: isNew,
          systemPrompt,
          onProgress: (message) => {
            sendResponse(ctx, message).catch(() => {});
          },
        });

        if (!result.success) {
          await ctx.reply(`Error: ${result.error?.slice(0, 500) || "Unknown error"}`);
          return;
        }

        // Process memory tags and strip them from response
        const cleanResponse = await processMemoryTags(result.result);

        // Save assistant response to DB
        saveMessage(chatId, "assistant", cleanResponse, {
          costUsd: result.costUsd,
          durationMs: result.durationMs,
        });

        await sessions.markActive(chatId);
        await sendResponse(ctx, cleanResponse);

        if (result.costUsd) {
          console.log(
            `Chat ${chatId}: $${result.costUsd.toFixed(4)} | ${result.durationMs}ms`
          );
        }
      } catch (err) {
        console.error("Message processing error:", err);
        await ctx.reply("An error occurred. Please try again.");
      } finally {
        stopTyping();
      }
    });
  }

  // Text messages
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    console.log(`Text from ${ctx.from?.id}: ${ctx.message.text.slice(0, 50)}...`);
    await processMessage(ctx, ctx.message.text);
  });

  // Photo messages
  bot.on("message:photo", async (ctx) => {
    console.log("Photo received");

    try {
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      const file = await ctx.api.getFile(photo.file_id);

      const timestamp = Date.now();
      const filePath = join(UPLOADS_DIR, `image_${timestamp}.jpg`);

      const response = await fetch(
        `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
      );
      const buffer = await response.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      const caption = ctx.message.caption || "Analyze this image.";
      const prompt = `[User sent an image saved at ${filePath}]\n\n${caption}`;

      await processMessage(ctx, prompt);

      await unlink(filePath).catch(() => {});
    } catch (err) {
      console.error("Photo error:", err);
      await ctx.reply("Could not process image.");
    }
  });

  // Document messages
  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    console.log(`Document: ${doc.file_name}`);

    try {
      const file = await ctx.getFile();
      const timestamp = Date.now();
      const fileName = doc.file_name || `file_${timestamp}`;
      const filePath = join(UPLOADS_DIR, `${timestamp}_${fileName}`);

      const response = await fetch(
        `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
      );
      const buffer = await response.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      const caption = ctx.message.caption || `Analyze this file: ${doc.file_name}`;
      const prompt = `[User sent a file: ${fileName}, saved at ${filePath}]\n\n${caption}`;

      await processMessage(ctx, prompt);

      await unlink(filePath).catch(() => {});
    } catch (err) {
      console.error("Document error:", err);
      await ctx.reply("Could not process document.");
    }
  });

  return bot;
}
