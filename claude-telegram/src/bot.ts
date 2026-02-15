import { Bot, type Context } from "grammy";
import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { callClaude } from "./claude";
import { SessionTracker, chatIdToSessionId } from "./session";
import {
  processMemoryTags,
  getMemoryContext,
  getMemorySummary,
  getMemoryDetail,
  clearMemory,
  setTaskStore,
} from "./memory";
import { sendResponse } from "./message";
import { MessageQueue } from "./queue";
import {
  initDb,
  getDb,
  saveMessage,
  getRecentMessages,
  searchMessages,
  getMessageCount,
  getConversationRecap,
} from "./db";
import {
  TaskStore,
  ForbiddenActions,
  AuditLog,
  Heartbeat,
  GoalStore,
  loadSoul,
  buildAgentSystemPrompt,
  type HeartbeatConfig,
  type MonitorDefinition,
} from "@namukeu/agent-core";
import { createTelegramAdapter } from "./platform";
import { seedInitialTasks } from "./seed-tasks";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ALLOWED_USER_ID = parseInt(process.env.TELEGRAM_USER_ID!, 10);
const USER_NAME = process.env.USER_NAME || "";
const USER_TIMEZONE = process.env.USER_TIMEZONE || "Asia/Seoul";
const UPLOADS_DIR = join(import.meta.dir, "..", "uploads");

let profileContext = "";
let soulContent = "";

const startTime = Date.now();

// Agent system exports
export let heartbeat: Heartbeat | null = null;
export let taskStore: TaskStore | null = null;
export let goalStore: GoalStore | null = null;
export let forbidden: ForbiddenActions | null = null;
export let auditLog: AuditLog | null = null;

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

async function loadSoulFile(): Promise<void> {
  soulContent = await loadSoul(
    join(import.meta.dir, "..", "config", "SOUL.md")
  );
}

function buildSystemPrompt(memoryContext: string, conversationRecap?: string): string {
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

  // Inject forbidden actions at the top
  if (forbidden) {
    const forbiddenBlock = forbidden.formatForPrompt();
    if (forbiddenBlock) parts.push(`\n${forbiddenBlock}`);
  }

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
    "\nTASK SCHEDULING:" +
      "\nYou can create autonomous tasks that run on a schedule. Include these tags:" +
      "\n[TASK: title | CRON: cron expression | PROMPT: what to do]" +
      "\n[TASK: title | AT: ISO datetime | PROMPT: what to do]" +
      "\n[CANCEL_TASK: search text for task title]"
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
  await loadSoulFile();
  initDb();

  const bot = new Bot(BOT_TOKEN);
  const sessions = new SessionTracker();
  await sessions.load();
  const queue = new MessageQueue();

  // --- Agent system initialization ---
  const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
  const CONFIG_DIR = join(import.meta.dir, "..", "config");
  const AGENT_ENABLED = process.env.AGENT_ENABLED !== "false";

  const db = getDb();
  taskStore = new TaskStore(db);
  setTaskStore(taskStore);

  goalStore = new GoalStore(db);

  forbidden = new ForbiddenActions(join(CONFIG_DIR, "forbidden.json"));
  await forbidden.load();

  auditLog = new AuditLog(join(DATA_DIR, "audit.log"));

  const platform = createTelegramAdapter(bot);

  const heartbeatConfig: HeartbeatConfig = {
    intervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || "300000", 10),
    dailyBudgetUsd: parseFloat(process.env.AGENT_DAILY_BUDGET_USD || "999"),
    quietHoursStart: parseInt(process.env.QUIET_HOURS_START || "-1", 10),
    quietHoursEnd: parseInt(process.env.QUIET_HOURS_END || "-1", 10),
    maxProactivePerHour: 5,
    timezone: USER_TIMEZONE,
    idle: {
      enabled: process.env.IDLE_TASKS_ENABLED !== "false",
      idleThresholdMs: parseInt(process.env.IDLE_THRESHOLD_MS || "600000", 10),
      maxIdleTasksPerDay: parseInt(process.env.IDLE_MAX_PER_DAY || "3", 10),
    },
    monitorsEnabled: process.env.MONITORS_ENABLED !== "false",
    chainingEnabled: process.env.CHAINING_ENABLED !== "false",
  };

  const defaultMonitors: MonitorDefinition[] = [
    {
      id: "health-all",
      name: "Service Health Check",
      eventName: "server_down",
      intervalMs: 60_000,
      enabled: true,
      config: {
        type: "health_check",
        endpoints: [
          { name: "coin-auto-trade", url: "http://127.0.0.1:8001/health", project: "COIN" },
          { name: "train-go", url: "http://127.0.0.1:8000/health", project: "TRAIN" },
          { name: "dashboard", url: "http://127.0.0.1:8002/health", project: "DASH" },
        ],
        failureThreshold: 3,
      },
    },
  ];

  if (AGENT_ENABLED) {
    heartbeat = new Heartbeat({
      taskStore,
      forbidden,
      audit: auditLog,
      platform,
      config: heartbeatConfig,
      notifyChatId: ALLOWED_USER_ID.toString(),
      monitors: defaultMonitors,
      goalStore,
      executeTask: async (task) => {
        const memoryContext = await getMemoryContext();
        const activeTasks = taskStore!
          .getActive()
          .map((t) => `- ${t.title} (${t.type})`)
          .join("\n");

        const timeStr = new Date().toLocaleString("en-US", {
          timeZone: USER_TIMEZONE,
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const goalsContext = goalStore ? goalStore.getByProject(task.project as any)
          .map(g => {
            const shared = g.projects.length > 1 ? ` (공유: ${g.projects.join(", ")})` : "";
            return `- [${g.priority.toUpperCase()}] ${g.title}${shared}`;
          }).join("\n") : "";

        const systemPrompt = buildAgentSystemPrompt({
          soul: soulContent,
          forbiddenBlock: forbidden!.formatForPrompt(),
          memoryContext,
          activeTasksSummary: activeTasks,
          userName: USER_NAME,
          currentTime: timeStr,
          goalsContext,
          chainingEnabled: heartbeatConfig.chainingEnabled,
        });

        const agentSessionId = chatIdToSessionId(0xA6E47, parseInt(task.id.replace(/-/g, "").slice(0, 8), 16));
        const result = await callClaude(task.prompt, {
          sessionId: agentSessionId,
          isNewSession: true,
          systemPrompt,
        });

        // Process tags in agent response too
        if (result.success) {
          const cleaned = await processMemoryTags(result.result);
          return {
            result: cleaned,
            costUsd: result.costUsd,
            durationMs: result.durationMs,
          };
        }
        return {
          result: result.error || "Task failed",
          costUsd: result.costUsd,
          durationMs: result.durationMs,
        };
      },
    });
    seedInitialTasks(taskStore);
    console.log("[agent] Autonomous agent system initialized");
  }

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
      "Claude Telegram Relay v2 + Agent System\n\n" +
        "Commands:\n" +
        "/reset — Start a new conversation\n" +
        "/status — Show bot status\n" +
        "/memory — Show stored memories\n" +
        "/forget — Clear all memories\n" +
        "/history — Recent conversation history\n" +
        "/search <query> — Search past messages\n\n" +
        "Agent Commands:\n" +
        "/tasks — View autonomous tasks\n" +
        "/cancel <id> — Cancel a task\n" +
        "/goals — View active goals\n" +
        "/monitors — View monitor status\n" +
        "/forbidden — View forbidden actions\n" +
        "/stop — Emergency stop agent\n" +
        "/resume_agent — Resume agent\n" +
        "/idle_on, /idle_off — Toggle idle exploration\n" +
        "/chain_on, /chain_off — Toggle task chaining"
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

    const agentStatus = heartbeat
      ? heartbeat.isStopped()
        ? "stopped"
        : "running"
      : "disabled";
    const activeTaskCount = taskStore ? taskStore.getActive().length : 0;

    const lines = [
      "Bot Status",
      `Session: ${session ? session.sessionId.slice(0, 8) + "..." : "none"}`,
      `Session messages: ${session?.messageCount || 0}`,
      `Total messages (DB): ${msgCount}`,
      `Generation: ${session?.generation || 0}`,
      `Memory: ${memorySummary}`,
      `Agent: ${agentStatus} | Tasks: ${activeTaskCount}`,
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

  // --- Agent commands ---

  bot.command("tasks", async (ctx) => {
    if (!taskStore) {
      await ctx.reply("Agent system is not enabled.");
      return;
    }
    const active = taskStore.getActive();
    if (active.length === 0) {
      await ctx.reply("No active tasks.");
      return;
    }

    const lines = ["Active Tasks:"];
    for (const t of active) {
      const status = t.status === "running" ? "🔄" : "⏳";
      const next = t.schedule_next
        ? ` (next: ${new Date(t.schedule_next).toLocaleString("ko-KR", { timeZone: USER_TIMEZONE, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })})`
        : "";
      const cron = t.schedule_cron ? ` [${t.schedule_cron}]` : "";
      lines.push(`${status} ${t.title}${cron}${next}\n   id: ${t.id.slice(0, 8)} | runs: ${t.run_count}`);
    }
    await sendResponse(ctx, lines.join("\n"));
  });

  bot.command("cancel", async (ctx) => {
    if (!taskStore) return;
    const search = ctx.match?.trim();
    if (!search) {
      await ctx.reply("Usage: /cancel <task-id or title>");
      return;
    }

    // Try by ID prefix first
    const all = taskStore.getActive();
    const byId = all.find((t) => t.id.startsWith(search));
    if (byId && taskStore.cancelTask(byId.id)) {
      await ctx.reply(`Task cancelled: ${byId.title}`);
      return;
    }

    // Try by title
    const byTitle = taskStore.findByTitle(search);
    if (byTitle && taskStore.cancelTask(byTitle.id)) {
      await ctx.reply(`Task cancelled: ${byTitle.title}`);
      return;
    }

    await ctx.reply("Task not found.");
  });

  bot.command("forbidden", async (ctx) => {
    if (!forbidden) return;
    await sendResponse(ctx, forbidden.formatForDisplay());
  });

  bot.command("stop", async (ctx) => {
    if (heartbeat) {
      heartbeat.stop();
      await ctx.reply("Agent stopped. Use /resume_agent to restart.");
    } else {
      await ctx.reply("Agent system is not running.");
    }
  });

  bot.command("resume_agent", async (ctx) => {
    if (heartbeat) {
      heartbeat.resume();
      await ctx.reply("Agent resumed.");
    } else {
      await ctx.reply("Agent system is not initialized.");
    }
  });

  bot.command("goals", async (ctx) => {
    if (!goalStore) { await ctx.reply("Goal system not initialized."); return; }
    const goals = goalStore.getActive();
    if (goals.length === 0) { await ctx.reply("활성 목표가 없습니다."); return; }
    const lines = ["Active Goals:"];
    for (const g of goals) {
      const prio = g.priority === "high" ? "★" : g.priority === "medium" ? "●" : "○";
      const shared = g.projects.length > 1 ? ` [${g.projects.join(",")}]` : ` [${g.projects[0]}]`;
      const deadline = g.deadline ? ` (by ${g.deadline})` : "";
      lines.push(`${prio} ${g.title}${shared}${deadline}`);
      if (g.progress) lines.push(`   → ${g.progress}`);
    }
    await sendResponse(ctx, lines.join("\n"));
  });

  bot.command("idle_on", async (ctx) => {
    if (heartbeat) { heartbeat.setIdleEnabled(true); await ctx.reply("Idle exploration enabled."); }
  });
  bot.command("idle_off", async (ctx) => {
    if (heartbeat) { heartbeat.setIdleEnabled(false); await ctx.reply("Idle exploration disabled."); }
  });
  bot.command("chain_on", async (ctx) => {
    if (heartbeat) { heartbeat.setChainingEnabled(true); await ctx.reply("Task chaining enabled."); }
  });
  bot.command("chain_off", async (ctx) => {
    if (heartbeat) { heartbeat.setChainingEnabled(false); await ctx.reply("Task chaining disabled."); }
  });
  bot.command("monitors", async (ctx) => {
    if (!heartbeat) { await ctx.reply("Agent not active."); return; }
    const ms = heartbeat.getMonitorSystem();
    if (!ms) { await ctx.reply("Monitors not configured."); return; }
    const status = ms.getStatus();
    const { healthy, total } = ms.getHealthyCount();
    const lines = [`Monitor Status: ${healthy}/${total} healthy`];
    for (const m of status.monitors) {
      const indicator = m.enabled ? "●" : "○";
      const failEntries = Object.entries(m.failures);
      const failStr = failEntries.length > 0 ? ` — ${failEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}` : "";
      lines.push(`${indicator} ${m.name}${failStr}`);
    }
    await sendResponse(ctx, lines.join("\n"));
  });

  bot.command("approve", async (ctx) => {
    if (!taskStore) { await ctx.reply("Task store not initialized."); return; }
    const searchText = ctx.match?.toString().trim();
    if (!searchText) { await ctx.reply("사용법: /approve <태스크 ID 앞 8자리>"); return; }

    const allTasks = taskStore.getActive();
    const task = allTasks.find(t => t.id.startsWith(searchText) && t.requires_approval);
    if (!task) {
      await ctx.reply(`승인 대기 중인 태스크를 찾을 수 없습니다: ${searchText}`);
      return;
    }

    // Remove approval requirement and set schedule to now
    taskStore.updateTask(task.id, {
      requires_approval: false,
      schedule_next: new Date().toISOString(),
    });

    await ctx.reply(`승인 완료: "${task.title}"\n다음 heartbeat tick에서 실행됩니다.`);
  });

  bot.command("pending", async (ctx) => {
    if (!taskStore) { await ctx.reply("Task store not initialized."); return; }
    const allTasks = taskStore.getActive();
    const pending = allTasks.filter(t => t.requires_approval);
    if (pending.length === 0) {
      await ctx.reply("승인 대기 중인 태스크가 없습니다.");
      return;
    }
    const lines = pending.map(t =>
      `• ${t.title}\n  /approve ${t.id.slice(0, 8)}`
    );
    await sendResponse(ctx, `승인 대기 (${pending.length}건):\n\n${lines.join("\n\n")}`);
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
          const recap = getConversationRecap(chatId, 30);
          systemPrompt = buildSystemPrompt(memoryContext, recap);
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
