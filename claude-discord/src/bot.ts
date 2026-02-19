import {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  Partials,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { readFile, writeFile, unlink } from "fs/promises";
import { spawn } from "child_process";
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
import { decrypt } from "./crypto";
import {
  initDb,
  saveMessage,
  getRecentMessages,
  searchMessages,
  getMessageCount,
  getConversationRecap,
} from "./db";
import {
  initScheduler,
  stopScheduler,
  addTask,
  removeTask,
  toggleTask,
  listTasks,
  formatTaskList,
  type ScheduledTask,
} from "./scheduler";

const ALLOWED_USER_ID = process.env.DISCORD_USER_ID!;
const USER_NAME = process.env.USER_NAME || "";
const USER_TIMEZONE = process.env.USER_TIMEZONE || "Asia/Seoul";
const GATE_URL = process.env.GATE_URL || "http://127.0.0.1:8080";
const GATE_USERNAME = process.env.GATE_USERNAME || "";
const GATE_ENCRYPTION_KEY = process.env.GATE_ENCRYPTION_KEY || "";
const GATE_TIMEOUT_MS = 10_000; // 10 second timeout for Gateway API calls
const GATE_PASSWORD = GATE_ENCRYPTION_KEY && process.env.GATE_PASSWORD
  ? decrypt(process.env.GATE_PASSWORD, GATE_ENCRYPTION_KEY)
  : process.env.GATE_PASSWORD || "";
const UPLOADS_DIR = join(import.meta.dir, "..", "uploads");
const DEDICATED_CHANNELS = new Set(
  (process.env.DEDICATED_CHANNELS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

// Channel → Project context mapping
// When the user talks in a project-specific channel, the assistant should
// focus on that project's codebase and avoid confusion after session resets.
const CHANNEL_PROJECT_MAP: Record<string, { project: string; codename: string; dir: string; description: string }> = {
  "1472150448558444576": { project: "coin-auto-trade", codename: "COIN", dir: "coin-auto-trade/", description: "Upbit 자동매매 서버 (Python FastAPI :8001)" },
  "1472220621340676217": { project: "ai-blog", codename: "BLOG", dir: "ai-blog/", description: "수익형 블로그 (Next.js + Bun :3100)" },
  "1472220670497788147": { project: "dashboard", codename: "DASH", dir: "dashboard/", description: "개인 대시보드 (React + FastAPI :8002)" },
  "1472819862123446345": { project: "api-gateway", codename: "GATE", dir: "api-gateway/", description: "API 게이트웨이 (Python FastAPI :8080)" },
  "1472820038607306804": { project: "content-pipeline", codename: "PIPE", dir: "content-pipeline/", description: "스케줄러 + 콘텐츠 파이프라인 (React + FastAPI :8003)" },
  "1473730339460485172": { project: "coin-auto-trade", codename: "COIN", dir: "coin-auto-trade/", description: "Upbit 자동매매 서버 (Python FastAPI :8001)" },
};

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

function buildSystemPrompt(memoryContext: string, conversationRecap?: string, channelId?: string): string {
  const parts: string[] = [];

  parts.push(
    "You are a personal AI assistant responding via Discord."
  );
  parts.push(
    "Keep responses concise and conversational. Use the same language as the user."
  );
  parts.push(
    "You have full agent capabilities: read/write files, run commands, search the web."
  );

  // Inject project context based on channel
  const channelProject = channelId ? CHANNEL_PROJECT_MAP[channelId] : undefined;
  if (channelProject) {
    parts.push(
      `\nPROJECT CONTEXT:` +
      `\nThis channel is dedicated to the **${channelProject.project}** project [${channelProject.codename}].` +
      `\n- Directory: /Users/namwook/Documents/namukeu/${channelProject.dir}` +
      `\n- Description: ${channelProject.description}` +
      `\nFocus on this project when the user asks about code, bugs, features, or deployments.` +
      `\nAlways check the project's CLAUDE.md for project-specific guidelines.` +
      `\nThe user may still ask general questions or cross-project tasks — handle those naturally.`
    );
  } else {
    parts.push(
      `\nPROJECT CONTEXT:` +
      `\nThis is a general channel. The user may discuss any project in the monorepo at /Users/namwook/Documents/namukeu/.` +
      `\nProjects: COIN (coin-auto-trade), BLOG (ai-blog), DASH (dashboard), TRAIN (train-go), TGBOT (claude-telegram), DCBOT (claude-discord).` +
      `\nRefer to the root CLAUDE.md for the full project structure.`
    );
  }

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
  if (conversationRecap) parts.push(`\n${conversationRecap}`);

  parts.push(
    "\nBROWSER CAPABILITIES:" +
      "\nYou have Playwright browser tools via MCP." +
      "\nYou can navigate to URLs, take screenshots, click elements, fill forms, and extract content from web pages." +
      "\nUse browser tools when the user asks to check websites, capture screenshots, or interact with web pages."
  );

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
      "\nThe user communicates via Discord and cannot see your intermediate work." +
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

function startTypingIndicator(channel: TextBasedChannel): () => void {
  // Discord typing indicator lasts 10 seconds, refresh every 9s
  channel.sendTyping().catch(() => {});
  const interval = setInterval(() => {
    channel.sendTyping().catch(() => {});
  }, 9000);
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

async function handleAttachments(message: Message, content: string): Promise<string> {
  const parts: string[] = [];

  for (const [, attachment] of message.attachments) {
    // Use message.id for unique file identification (more reliable than timestamp)
    const uniqueId = message.id;
    const fileName = attachment.name || `file_${uniqueId}`;
    const filePath = join(UPLOADS_DIR, `${uniqueId}_${fileName}`);

    try {
      const response = await fetch(attachment.url);
      const buffer = await response.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      if (attachment.contentType?.startsWith("image/")) {
        parts.push(`[User sent an image saved at ${filePath}]`);
      } else {
        parts.push(`[User sent a file: ${fileName}, saved at ${filePath}]`);
      }
    } catch (err) {
      console.error("Attachment download error:", err);
    }
  }

  const attachmentContext = parts.join("\n");
  const caption = content || "Analyze this.";
  return `${attachmentContext}\n\n${caption}`;
}

export async function createBot(): Promise<Client> {
  await loadProfile();
  initDb();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel], // Required for DM support
  });

  const sessions = new SessionTracker();
  await sessions.load();
  const queue = new MessageQueue();

  // --- Ready event ---
  client.once(Events.ClientReady, async (c) => {
    console.log(`Bot is running as ${c.user.tag}. Waiting for messages...`);

    // Initialize scheduler — scheduled tasks send prompts to channels via Claude
    await initScheduler(
      async (task: ScheduledTask) => {
      console.log(`[scheduler] Running task "${task.name}" in channel ${task.channelId}`);
      try {
        const channel = await client.channels.fetch(task.channelId);
        if (!channel || !channel.isTextBased()) {
          console.error(`[scheduler] Channel ${task.channelId} not found or not text-based`);
          return;
        }

        const textChannel = channel as TextBasedChannel;
        const stopTyping = startTypingIndicator(textChannel);

        try {
          const isNew = sessions.isNewSession(task.channelId);
          const sessionId = sessions.getSessionId(task.channelId);

          let finalPrompt: string;
          let systemPrompt: string | undefined;

          if (isNew) {
            const memoryContext = await getMemoryContext();
            const recap = getConversationRecap(task.channelId, 30);
            systemPrompt = buildSystemPrompt(memoryContext, recap, task.channelId);
            finalPrompt = `[Scheduled Task: ${task.name}]\n\n${task.prompt}`;
          } else {
            const prefix = buildResumePrefix();
            finalPrompt = `${prefix}\n\n[Scheduled Task: ${task.name}]\n\n${task.prompt}`;
          }

          const result = await callClaude(finalPrompt, {
            sessionId,
            isNewSession: isNew,
            systemPrompt,
            onProgress: (progressMsg) => {
              sendResponse(textChannel, progressMsg).catch(() => {});
            },
          });

          if (result.success) {
            const cleanResponse = await processMemoryTags(result.result);
            saveMessage(task.channelId, "assistant", cleanResponse, {
              costUsd: result.costUsd,
              durationMs: result.durationMs,
            });
            await sessions.markActive(task.channelId);
            await sendResponse(textChannel, cleanResponse);
            console.log(`[scheduler] Task "${task.name}" done — $${result.costUsd?.toFixed(4) || "?"}`);
          } else {
            console.error(`[scheduler] Task "${task.name}" Claude error:`, result.error);
            // Send error notification to channel
            await sendResponse(
              textChannel,
              `⚠️ 예약 작업 "${task.name}" 실패\n\`\`\`\n${result.error?.slice(0, 500) || "알 수 없는 오류"}\n\`\`\``
            ).catch(() => {});
          }
        } finally {
          stopTyping();
        }
      } catch (err) {
        console.error(`[scheduler] Task "${task.name}" failed:`, err);
        // Send error notification to channel
        await sendResponse(
          textChannel,
          `⚠️ 예약 작업 "${task.name}" 실패\n\`\`\`\n${String(err).slice(0, 500)}\n\`\`\``
        ).catch(() => {});
      }
    },
      async (task: ScheduledTask) => {
        // Quiet hours skip notification
        try {
          const channel = await client.channels.fetch(task.channelId);
          if (!channel || !channel.isTextBased()) return;
          const textChannel = channel as TextBasedChannel;

          const nextRun = new Date(task.nextRunAt).toLocaleString("ko-KR", {
            timeZone: USER_TIMEZONE,
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          await sendResponse(
            textChannel,
            `🌙 예약 작업 "${task.name}" — 조용한 시간(23:00-08:00)이라 건너뛰었어요.\n다음 실행: ${nextRun}`
          ).catch(() => {});
        } catch (err) {
          console.error(`[scheduler] Skip notification error:`, err);
        }
      }
    );
  });

  // --- Slash command handler ---
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.user.id !== ALLOWED_USER_ID) {
      await interaction.reply({ content: "Unauthorized.", ephemeral: true });
      return;
    }

    const channelId = interaction.channelId;

    switch (interaction.commandName) {
      case "reset": {
        await sessions.resetSession(channelId);
        await interaction.reply("Session reset. Starting a new conversation.");
        console.log(`Session reset for channel ${channelId}`);
        break;
      }

      case "status": {
        const session = sessions.getSession(channelId);
        const memorySummary = await getMemorySummary();
        const msgCount = getMessageCount(channelId);
        const uptime = (Date.now() - startTime) / 1000;

        const lines = [
          "**Bot Status**",
          `Session: \`${session ? session.sessionId.slice(0, 8) + "..." : "none"}\``,
          `Session messages: ${session?.messageCount || 0}`,
          `Total messages (DB): ${msgCount}`,
          `Generation: ${session?.generation || 0}`,
          `Memory: ${memorySummary}`,
          `Uptime: ${formatUptime(uptime)}`,
        ];

        await interaction.reply(lines.join("\n"));
        break;
      }

      case "memory": {
        const detail = await getMemoryDetail();
        await interaction.reply(detail.slice(0, 2000));
        break;
      }

      case "forget": {
        await clearMemory();
        await interaction.reply("All memories cleared.");
        break;
      }

      case "history": {
        const limit = Math.min(interaction.options.getInteger("count") || 10, 50);
        const messages = getRecentMessages(channelId, limit);

        if (messages.length === 0) {
          await interaction.reply("No conversation history yet.");
          break;
        }

        const lines = messages.reverse().map((m) => {
          const time = formatTimestamp(m.created_at);
          const role = m.role === "user" ? "You" : "Claude";
          const content =
            m.content.length > 150 ? m.content.slice(0, 150) + "..." : m.content;
          return `[${time}] **${role}**: ${content}`;
        });

        const total = getMessageCount(channelId);
        const header = `Recent ${messages.length} of ${total} messages:\n\n`;
        const result = (header + lines.join("\n\n")).slice(0, 2000);
        await interaction.reply(result);
        break;
      }

      case "search": {
        const query = interaction.options.getString("query", true);
        const messages = searchMessages(channelId, query, 10);

        if (messages.length === 0) {
          await interaction.reply(`No messages found matching "${query}".`);
          break;
        }

        const lines = messages.map((m) => {
          const time = formatTimestamp(m.created_at);
          const role = m.role === "user" ? "You" : "Claude";
          const content =
            m.content.length > 200 ? m.content.slice(0, 200) + "..." : m.content;
          return `[${time}] **${role}**: ${content}`;
        });

        const result = (
          `Found ${messages.length} messages matching "${query}":\n\n` +
          lines.join("\n\n")
        ).slice(0, 2000);
        await interaction.reply(result);
        break;
      }

      case "coin": {
        await interaction.deferReply();
        try {
          const summary = await fetchCoinSummary();
          await interaction.editReply(summary);
        } catch (err) {
          await interaction.editReply(`coin-auto-trade 서버 연결 실패: ${err}`);
        }
        break;
      }

      case "blog": {
        await interaction.deferReply();
        const stage = interaction.options.getString("stage") || "all";
        const stageLabels: Record<string, string> = {
          all: "전체 파이프라인",
          research: "글감 수집",
          write: "글 작성",
          review: "검토",
          notify: "알림",
        };
        const label = stageLabels[stage] || stage;
        await interaction.editReply(`블로그 ${label}을 시작합니다...`);

        try {
          const result = await runBlogPipeline(stage);
          const msg = result.success
            ? `**블로그 ${label} 완료** (Pipeline: \`${result.pipelineId}\`)\n\n${result.output.slice(-1400)}`
            : `**블로그 ${label} 실패** (Pipeline: \`${result.pipelineId}\`)\n\n\`\`\`\n${result.error?.slice(-500)}\n\`\`\``;
          await interaction.editReply(msg.slice(0, 2000));
        } catch (err) {
          await interaction.editReply(`파이프라인 실행 실패: ${err}`);
        }
        break;
      }

      case "schedule": {
        const sub = interaction.options.getSubcommand();

        if (sub === "list") {
          const list = formatTaskList();
          await interaction.reply(list.slice(0, 2000));
        } else if (sub === "add") {
          const name = interaction.options.getString("name", true);
          const intervalMinutes = interaction.options.getInteger("interval", true);
          const prompt = interaction.options.getString("prompt", true);
          const targetChannel = interaction.options.getChannel("channel");
          const targetChannelId = targetChannel?.id || channelId;

          const task = await addTask({
            channelId: targetChannelId,
            name,
            intervalMinutes,
            prompt,
          });

          const intervalStr = intervalMinutes >= 60
            ? `${Math.floor(intervalMinutes / 60)}시간 ${intervalMinutes % 60 ? `${intervalMinutes % 60}분` : ""}`
            : `${intervalMinutes}분`;
          await interaction.reply(
            `✅ 예약 작업 추가됨\n` +
            `**${name}** — ${intervalStr}마다\n` +
            `채널: <#${targetChannelId}>\n` +
            `ID: \`${task.id.slice(0, 8)}\``
          );
        } else if (sub === "remove") {
          const idPrefix = interaction.options.getString("id", true);
          const tasks = listTasks();
          const match = tasks.find((t) => t.id.startsWith(idPrefix));
          if (!match) {
            await interaction.reply(`작업을 찾을 수 없습니다: \`${idPrefix}\``);
          } else {
            await removeTask(match.id);
            await interaction.reply(`🗑️ **${match.name}** 삭제됨`);
          }
        } else if (sub === "toggle") {
          const idPrefix = interaction.options.getString("id", true);
          const tasks = listTasks();
          const match = tasks.find((t) => t.id.startsWith(idPrefix));
          if (!match) {
            await interaction.reply(`작업을 찾을 수 없습니다: \`${idPrefix}\``);
          } else {
            const updated = await toggleTask(match.id);
            const status = updated?.enabled ? "✅ 활성화" : "⬜ 비활성화";
            await interaction.reply(`${status}: **${match.name}**`);
          }
        }
        break;
      }
    }
  });

  // --- Message handler ---
  client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Auth check
    if (message.author.id !== ALLOWED_USER_ID) return;

    // Check if bot is mentioned, DM, or dedicated channel
    const isMentioned = message.mentions.has(client.user!);
    const isDM = message.channel.type === ChannelType.DM;
    const isDedicatedChannel = DEDICATED_CHANNELS.has(message.channelId);

    if (!isMentioned && !isDM && !isDedicatedChannel) return;

    // Strip the mention from the message content
    let content = message.content.replace(/<@!?\d+>/g, "").trim();

    // Handle attachments
    if (message.attachments.size > 0) {
      content = await handleAttachments(message, content);
    }

    if (!content && message.attachments.size === 0) return;

    console.log(
      `Message from ${message.author.tag} in ${isDM ? "DM" : `#${(message.channel as any).name || message.channelId}`}: ${content.slice(0, 50)}...`
    );
    await processMessage(message, content);
  });

  // --- Core message processing ---
  async function processMessage(message: Message, prompt: string): Promise<void> {
    const channelId = message.channelId;

    await queue.enqueue(channelId, async () => {
      const stopTyping = startTypingIndicator(message.channel as TextBasedChannel);

      try {
        // Save user message to DB
        saveMessage(channelId, "user", prompt);

        const isNew = sessions.isNewSession(channelId);
        const sessionId = sessions.getSessionId(channelId);

        let finalPrompt: string;
        let systemPrompt: string | undefined;

        if (isNew) {
          const memoryContext = await getMemoryContext();
          const recap = getConversationRecap(channelId, 30);
          systemPrompt = buildSystemPrompt(memoryContext, recap, channelId);
          finalPrompt = prompt;
        } else {
          const prefix = buildResumePrefix();
          finalPrompt = `${prefix}\n\n${prompt}`;
        }

        const result = await callClaude(finalPrompt, {
          sessionId,
          isNewSession: isNew,
          systemPrompt,
          onProgress: (progressMsg) => {
            sendResponse(message.channel as TextBasedChannel, progressMsg).catch(() => {});
          },
        });

        if (!result.success) {
          await message.reply(`Error: ${result.error?.slice(0, 500) || "Unknown error"}`);
          return;
        }

        // Process memory tags and strip them from response
        const cleanResponse = await processMemoryTags(result.result);

        // Save assistant response to DB
        saveMessage(channelId, "assistant", cleanResponse, {
          costUsd: result.costUsd,
          durationMs: result.durationMs,
        });

        await sessions.markActive(channelId);

        // Clean up attachment files after processing
        for (const [, attachment] of message.attachments) {
          // Use exact message.id for reliable file deletion
          const uniqueId = message.id;
          const fileName = attachment.name || `file_${uniqueId}`;
          const filePath = join(UPLOADS_DIR, `${uniqueId}_${fileName}`);
          try {
            await unlink(filePath);
          } catch (err) {
            console.warn(`[cleanup] Failed to delete attachment file ${filePath}:`, err);
            // Notify user about cleanup failure
            await sendResponse(
              message.channel as TextBasedChannel,
              `⚠️ 파일 정리 실패: ${fileName}`
            ).catch(() => {});
          }
        }

        await sendResponse(message.channel as TextBasedChannel, cleanResponse);

        if (result.costUsd) {
          console.log(
            `Channel ${channelId}: $${result.costUsd.toFixed(4)} | ${result.durationMs}ms`
          );
        }
      } catch (err) {
        console.error("Message processing error:", err);
        await message.reply("An error occurred. Please try again.");
      } finally {
        stopTyping();
      }
    });
  }

  return client;
}

// --- Gateway API ---

let gateToken: string | null = null;

async function gateLogin(): Promise<string> {
  const resp = await fetch(`${GATE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: GATE_USERNAME, password: GATE_PASSWORD }),
  });
  if (!resp.ok) throw new Error(`Gate login failed: ${resp.status}`);
  const data = await resp.json() as { access_token: string };
  gateToken = data.access_token;
  return gateToken;
}

async function gateApi(path: string, retryCount: number = 0): Promise<any> {
  if (!gateToken) await gateLogin();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GATE_TIMEOUT_MS);

  try {
    let resp = await fetch(`${GATE_URL}${path}`, {
      headers: { Authorization: `Bearer ${gateToken}` },
      signal: controller.signal,
    });

    // Token expired — re-login and retry once
    if (resp.status === 401 && retryCount === 0) {
      console.log(`[gate] Token expired for ${path}, re-logging in...`);
      clearTimeout(timeoutId);
      await gateLogin();
      return gateApi(path, retryCount + 1);
    }

    // Service unavailable — exponential backoff retry (max 2 retries)
    if (resp.status >= 500 && retryCount < 2) {
      console.log(`[gate] Service unavailable (${resp.status}) for ${path}, retry ${retryCount + 1}/2...`);
      clearTimeout(timeoutId);
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise((r) => setTimeout(r, delay));
      return gateApi(path, retryCount + 1);
    }

    if (!resp.ok) {
      // 상세 에러 정보 로깅
      const status = resp.status;
      const statusText = resp.statusText;
      let body = "";
      try {
        body = await resp.text();
      } catch {}
      console.error(`[gate] API Error | ${status} ${statusText} | path: ${path} | body: ${body.slice(0, 500)}`);
      throw new Error(`${status} ${statusText}`);
    }
    return resp.json();
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const isNetworkError = err instanceof TypeError && err.message.includes("fetch");
    if (isTimeout) {
      console.error(`[gate] Timeout | ${GATE_TIMEOUT_MS}ms | path: ${path}`);
      throw new Error(`Gateway API timeout after ${GATE_TIMEOUT_MS}ms: ${path}`);
    }
    if (isNetworkError) {
      console.error(`[gate] Network Error | path: ${path} | error: ${err}`);
      throw new Error(`Gateway API network error: ${err}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function coinApi(path: string): Promise<any> {
  const fullPath = `/api/coin${path}`;
  try {
    return await gateApi(fullPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[coin] API failed | path: ${fullPath} | error: ${msg}`);
    // Throw a structured error for command handlers to catch
    throw new Error(`[COIN] ${msg}`);
  }
}

function krw(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function pct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

// --- Blog pipeline ---

const BLOG_DIR = "/Users/namwook/Documents/namukeu/ai-blog";
const BLOG_PIPELINE_SCRIPT = `${BLOG_DIR}/agents/run-pipeline.sh`;
const BLOG_STAGE_SCRIPT = `${BLOG_DIR}/agents/run-stage.sh`;
const BLOG_DB = `${BLOG_DIR}/data/blog.db`;

function runBlogPipeline(stage: string = "all"): Promise<{ success: boolean; output: string; pipelineId: string; error?: string }> {
  return new Promise(async (resolve) => {
    let pipelineId: string;
    let script: string;
    let args: string[];

    if (stage === "all") {
      pipelineId = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/(\d{8})(\d{6})/, "$1-$2");
      script = BLOG_PIPELINE_SCRIPT;
      args = [script];
    } else {
      // 단일 스테이지: 가장 최근 pipeline_id 자동 조회
      try {
        const proc = Bun.spawnSync(["sqlite3", BLOG_DB, "SELECT pipeline_id FROM drafts WHERE pipeline_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;"]);
        pipelineId = proc.stdout.toString().trim();
      } catch {
        pipelineId = "";
      }
      if (!pipelineId) {
        resolve({ success: false, output: "", pipelineId: "none", error: "실행할 파이프라인이 없습니다. 먼저 /blog 또는 /blog stage:글감 수집을 실행하세요." });
        return;
      }
      script = BLOG_STAGE_SCRIPT;
      args = [script, stage, pipelineId];
    }

    console.log(`[blog] Running: ${script} ${args.slice(1).join(" ")}`);
    const child = spawn("bash", args, { cwd: BLOG_DIR });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[blog] Pipeline ${pipelineId} completed successfully`);
        resolve({ success: true, output: stdout, pipelineId });
      } else {
        console.error(`[blog] Pipeline ${pipelineId} failed with code ${code}:`, stderr.slice(0, 200));
        // Show both stdout (last lines) and stderr
        const errorMsg = stderr.trim()
          ? `[BLOG] stderr:\n${stderr.slice(0, 500)}`
          : `[BLOG] Exit code: ${code}`;
        resolve({ success: false, output: stdout, pipelineId, error: errorMsg });
      }
    });

    child.on("error", (err) => {
      resolve({ success: false, output: "", pipelineId: pipelineId || "unknown", error: err.message });
    });
  });
}

async function fetchCoinSummary(): Promise<string> {
  const [status, positions, orders, configs] = await Promise.all([
    coinApi("/status"),
    coinApi("/trading/positions"),
    coinApi("/trading/orders?limit=5"),
    coinApi("/strategies/configs"),
  ]);

  // Portfolio from latest snapshot
  let portfolioLine = "";
  try {
    const portfolio = await coinApi("/portfolio/summary");
    portfolioLine =
      `총 자산: **${krw(portfolio.total_equity)}** KRW\n` +
      `현금: ${krw(portfolio.cash_balance)} | 포지션: ${krw(portfolio.positions_value)}\n` +
      `수익: **${pct(portfolio.total_pnl_pct)}** (${krw(portfolio.total_pnl)} KRW)`;
  } catch {
    portfolioLine = "포트폴리오: 데이터 없음";
  }

  // Status
  const mode = status.dry_run ? "DRY-RUN" : "LIVE";
  const statusLine =
    `모드: **${mode}** | 전략: ${status.active_strategies}개 | 포지션: ${status.active_positions}개`;

  // Positions
  let posLine = "";
  if (positions.length > 0) {
    posLine = positions
      .map((p: any) => {
        const pnlEmoji = p.unrealized_pnl_pct >= 0 ? "🟢" : "🔴";
        return `${pnlEmoji} \`${p.ticker}\` ${p.volume.toFixed(6)} @ ${krw(p.avg_entry_price)} → ${krw(p.current_price || 0)} (${pct(p.unrealized_pnl_pct)})`;
      })
      .join("\n");
  } else {
    posLine = "없음";
  }

  // Recent orders
  let orderLine = "";
  if (orders.length > 0) {
    orderLine = orders
      .map((o: any) => {
        const emoji = o.side === "buy" ? "🟢" : "🔴";
        const time = o.created_at?.slice(5, 16) || "";
        const amt = o.amount_krw ? krw(o.amount_krw) + " KRW" : o.volume?.toFixed(6) || "-";
        return `${emoji} ${time} ${o.side.toUpperCase()} \`${o.ticker}\` ${amt}`;
      })
      .join("\n");
  } else {
    orderLine = "없음";
  }

  // Strategies
  let stratLine = "";
  if (configs.length > 0) {
    stratLine = configs
      .map((c: any) => {
        const badge = c.enabled ? "✅" : "⬜";
        return `${badge} ${c.name} → \`${c.ticker}\` (${c.interval})`;
      })
      .join("\n");
  } else {
    stratLine = "없음";
  }

  return [
    "**📊 coin-auto-trade 요약**",
    "",
    `**상태**\n${statusLine}`,
    "",
    `**포트폴리오**\n${portfolioLine}`,
    "",
    `**보유 포지션**\n${posLine}`,
    "",
    `**최근 거래 (5건)**\n${orderLine}`,
    "",
    `**전략 설정**\n${stratLine}`,
  ].join("\n");
}
