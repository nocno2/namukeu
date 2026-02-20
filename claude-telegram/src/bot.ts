import { Bot, InlineKeyboard, type Context } from "grammy";
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
} from "./memory";
import {
  getRevenueStatus,
  setMonthlyTarget,
  addRevenue,
  getRevenueHistory,
  addCost,
  getCostStatus,
  getCostHistory,
  getProfitSummary,
  getRevenueForecast,
  getRevenueBySource,
  getFormattedInsights,
  getInsightsWithActions,
  syncAllRevenue,
  getRevenueStatusAll,
  checkGoalAlerts,
  getFormattedAutoActions,
  getAutoActions,
  clearAutoActions,
  acknowledgeAction,
  acknowledgeAllActions,
  getNewActionsCount,
  getFormattedSourcePerformance,
  type InsightActionType,
} from "./revenue";
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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ALLOWED_USER_ID = parseInt(process.env.TELEGRAM_USER_ID!, 10);
const USER_NAME = process.env.USER_NAME || "";
const USER_TIMEZONE = process.env.USER_TIMEZONE || "Asia/Seoul";
const UPLOADS_DIR = join(import.meta.dir, "..", "uploads");

// Content-pipeline API for agent commands
const PIPELINE_API = process.env.PIPELINE_API_URL || "http://127.0.0.1:8003";
const PIPELINE_TOKEN = process.env.AGENT_API_TOKEN || "agent-api-token";

// Blog admin URL for user-facing links
const BLOG_ADMIN_URL = process.env.BLOG_ADMIN_URL || "https://blog.namukeu.com/admin";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://dashboard.namukeu.com";
const PROJECT_ROOT = process.env.PROJECT_ROOT || "/Users/namwook/Documents/namukeu";

let profileContext = "";

const startTime = Date.now();

// ─── Pipeline API helper ───

async function pipelineApi(
  path: string,
  method: string = "GET",
  body?: Record<string, any>
): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${PIPELINE_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const resp = await fetch(`${PIPELINE_API}${path}`, opts);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
    }
    return await resp.json();
  } catch (err) {
    console.error(`[pipeline-api] ${method} ${path} failed:`, err);
    throw err;
  }
}

// ─── Forbidden config (loaded from file for system prompt) ───

let forbiddenBlock = "";
async function loadForbidden(): Promise<void> {
  try {
    const raw = await readFile(
      join(import.meta.dir, "..", "config", "forbidden.json"),
      "utf-8"
    );
    const config = JSON.parse(raw);
    if (!config.rules || config.rules.length === 0) return;
    const lines = [
      "════════════════════════════════════════",
      "FORBIDDEN ACTIONS — IMMUTABLE SAFETY RULES",
      "════════════════════════════════════════",
    ];
    for (const rule of config.rules) {
      if (rule.type === "cost_limit") {
        lines.push(`- NEVER exceed $${rule.max_cost_usd} per single execution`);
      } else if (rule.type === "rate_limit") {
        lines.push(`- NEVER send more than ${rule.max_per_hour} proactive messages per hour`);
      } else {
        lines.push(`- NEVER: ${rule.description}`);
      }
    }
    lines.push("════════════════════════════════════════");
    forbiddenBlock = lines.join("\n");
  } catch {
    // No forbidden config
  }
}

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

  if (forbiddenBlock) parts.push(`\n${forbiddenBlock}`);

  parts.push(
    `\nPROJECT CONTEXT:` +
    `\nYou work on a monorepo at ${PROJECT_ROOT} with these projects:` +
    `\n- COIN (coin-auto-trade/): Upbit 자동매매 서버 (Python FastAPI :8001)` +
    `\n- BLOG (ai-blog/): 수익형 블로그 (Next.js + Bun :3100)` +
    `\n- DASH (dashboard/): 개인 대시보드 (React + FastAPI :8002)` +
    `\n- TRAIN (train-go/): SRT/Korail 자동예매 서버 (Python FastAPI :8000)` +
    `\n- TGBOT (claude-telegram/): Telegram 릴레이 봇 (Bun + grammY)` +
    `\n- DCBOT (claude-discord/): Discord 릴레이 봇 (Bun + discord.js)` +
    `\nThis is a Telegram chat — the user may discuss any project. Infer the relevant project from context.` +
    `\nRefer to each project's CLAUDE.md for project-specific guidelines.`
  );

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
  await loadForbidden();
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
      "Claude Telegram Relay v2 + Agent System\n\n" +
        "Commands:\n" +
        "/reset — Start a new conversation\n" +
        "/status — Show bot status\n" +
        "/memory — Show stored memories\n" +
        "/forget — Clear all memories\n" +
        "/history — Recent conversation history\n" +
        "/search <query> — Search past messages\n\n" +
        "Revenue Tracking:\n" +
        "/revenue — Show revenue status\n" +
        "/revenue set <amount> — Set monthly target\n" +
        "/revenue add <amount> — Add revenue\n" +
        "/revenue history — Show history\n" +
        "/forecast — Monthly forecast\n" +
        "/insights — AI revenue insights\n" +
        "/actions — Auto actions based on insights\n" +
        "/actions_ack — Acknowledge actions\n\n" +
        "Blog Automation:\n" +
        "/blog auto <keyword> — Generate blog post\n" +
        "/blog idea <idea> — Generate from idea\n\n" +
        "Cost Tracking:\n" +
        "/cost — Show cost status\n" +
        "/cost add <amount> <category> — Add cost\n" +
        "/cost history — Show cost history\n" +
        "/cost profit — Show profit summary\n\n" +
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

    let agentStatus = "disconnected";
    let activeTaskCount = 0;
    try {
      const status = await pipelineApi("/api/status");
      agentStatus = status.running ? "running" : "stopped";
      activeTaskCount = status.todayTaskCount || 0;
    } catch {
      agentStatus = "unreachable";
    }

    const lines = [
      "Bot Status",
      `Session: ${session ? session.sessionId.slice(0, 8) + "..." : "none"}`,
      `Session messages: ${session?.messageCount || 0}`,
      `Total messages (DB): ${msgCount}`,
      `Generation: ${session?.generation || 0}`,
      `Memory: ${memorySummary}`,
      `Agent: ${agentStatus} | Today tasks: ${activeTaskCount}`,
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

  // --- Agent commands (all proxied to content-pipeline API) ---

  bot.command("tasks", async (ctx) => {
    try {
      const tasks = await pipelineApi("/api/agent-tasks?active_only=true");
      if (!tasks || tasks.length === 0) {
        await ctx.reply("No active tasks.");
        return;
      }

      const lines = ["Active Tasks:"];
      for (const t of tasks) {
        const status = t.status === "running" ? "🔄" : "⏳";
        const next = t.schedule_next
          ? ` (next: ${new Date(t.schedule_next).toLocaleString("ko-KR", { timeZone: USER_TIMEZONE, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })})`
          : "";
        const cron = t.schedule_cron ? ` [${t.schedule_cron}]` : "";
        lines.push(`${status} ${t.title}${cron}${next}\n   id: ${t.id.slice(0, 8)} | runs: ${t.run_count}`);
      }
      await sendResponse(ctx, lines.join("\n"));
    } catch (err) {
      await ctx.reply(`Failed to fetch tasks: ${err}`);
    }
  });

  bot.command("cancel", async (ctx) => {
    const search = ctx.match?.trim();
    if (!search) {
      await ctx.reply("Usage: /cancel <task-id or title>");
      return;
    }

    try {
      await pipelineApi(`/api/agent-tasks/${search}/cancel`, "POST");
      await ctx.reply(`Task cancelled: ${search}`);
    } catch (err) {
      await ctx.reply(`Failed to cancel: ${err}`);
    }
  });

  bot.command("forbidden", async (ctx) => {
    try {
      const rules = await pipelineApi("/api/forbidden");
      if (!rules || rules.length === 0) {
        await ctx.reply("No forbidden actions configured.");
        return;
      }
      const lines = ["Forbidden Actions:"];
      for (const rule of rules) {
        const severity = rule.severity === "critical" ? "🔴" : "🟡";
        lines.push(`${severity} [${rule.id}] ${rule.description}`);
      }
      await sendResponse(ctx, lines.join("\n"));
    } catch (err) {
      await ctx.reply(`Failed to fetch forbidden rules: ${err}`);
    }
  });

  // Revenue tracking
  bot.command("revenue", async (ctx) => {
    const args = ctx.match?.trim() || "";
    const parts = args.split(" ");
    const subcommand = parts[0].toLowerCase();

    try {
      if (!subcommand || subcommand === "status") {
        // Show current revenue status
        const status = await getRevenueStatus();
        await sendResponse(ctx, status);
      } else if (subcommand === "set") {
        // /revenue set 50000 - set monthly target
        const amount = parseInt(parts[1]?.replace(/[^0-9]/g, "") || "0", 10);
        if (!amount || amount <= 0) {
          await ctx.reply("사용법: /revenue set <금액>\n예: /revenue set 50000");
          return;
        }
        const msg = await setMonthlyTarget(amount);
        await ctx.reply(msg);
      } else if (subcommand === "add") {
        // /revenue add 10000 adsense - add revenue
        const amount = parseInt(parts[1]?.replace(/[^0-9]/g, "") || "0", 10);
        const source = parts.slice(2).join(" ") || "manual";
        if (!amount || amount <= 0) {
          await ctx.reply("사용법: /revenue add <금액> <출처>\n예: /revenue add 10000 adsense");
          return;
        }
        const msg = await addRevenue(amount, source);
        await ctx.reply(msg);
      } else if (subcommand === "history") {
        const months = parseInt(parts[1] || "6", 10);
        const history = await getRevenueHistory(months);
        await sendResponse(ctx, history);
      } else if (subcommand === "profit") {
        const months = parseInt(parts[1] || "6", 10);
        const summary = await getProfitSummary(months);
        await sendResponse(ctx, summary);
      } else if (subcommand === "forecast") {
        const forecast = await getRevenueForecast();
        await sendResponse(ctx, forecast);
      } else if (subcommand === "sources") {
        const months = parseInt(parts[1] || "12", 10);
        const sources = await getRevenueBySource(months);
        await sendResponse(ctx, sources);
      } else if (subcommand === "compare") {
        // /revenue compare [months] - compare source performance
        const months = parseInt(parts[1] || "6", 10);
        const comparison = await getFormattedSourcePerformance(months);
        await sendResponse(ctx, comparison);
      } else if (subcommand === "alert") {
        // /revenue alert - check goal alerts
        const alert = await checkGoalAlerts();
        await sendResponse(ctx, alert.message);
      } else if (subcommand === "sync") {
        // /revenue sync - sync from COIN and BLOG
        await ctx.reply("수익 동기화 중...");
        const result = await syncAllRevenue();
        await sendResponse(ctx, result);
      } else if (subcommand === "statusall") {
        // /revenue statusall - show current status from all sources
        const status = await getRevenueStatusAll();
        await sendResponse(ctx, status);
      } else if (subcommand === "help") {
        await ctx.reply(
          "수익 추적 명령어:\n\n" +
            "/revenue — 현재 상태 확인\n" +
            "/revenue set 50000 — 월 목표 설정\n" +
            "/revenue add 10000 adsense — 수익 추가\n" +
            "/revenue sync — COIN/BLOG에서 자동 동기화\n" +
            "/revenue statusall — 모든 출처 현황 조회\n" +
            "/revenue history — 월별 이력 확인\n" +
            "/revenue profit — 손익 요약\n" +
            "/revenue forecast — 월말 예측\n" +
            "/revenue sources — 수익 원별 분석\n" +
            "/revenue compare — 수익원 성과 비교\n" +
            "/revenue alert — 목표 달성 경고 확인\n" +
            "/insights — AI 수익 인사이트\n" +
            "/revenue help — 도움말"
        );
      } else {
        await ctx.reply("알 수 없는 명령어입니다. /revenue help 를 입력하세요.");
      }
    } catch (err) {
      await ctx.reply(`오류: ${err}`);
    }
  });

  // Cost tracking
  bot.command("cost", async (ctx) => {
    const args = ctx.match?.trim() || "";
    const parts = args.split(" ");
    const subcommand = parts[0].toLowerCase();

    try {
      if (!subcommand || subcommand === "status") {
        const status = await getCostStatus();
        await sendResponse(ctx, status);
      } else if (subcommand === "add") {
        // /cost add 5000 server - add cost
        const amount = parseInt(parts[1]?.replace(/[^0-9]/g, "") || "0", 10);
        const category = parts[2] || "general";
        const description = parts.slice(3).join(" ") || undefined;
        if (!amount || amount <= 0) {
          await ctx.reply("사용법: /cost add <금액> <카테고리> [설명]\n예: /cost add 5000 server");
          return;
        }
        const msg = await addCost(amount, category, description);
        await ctx.reply(msg);
      } else if (subcommand === "history") {
        const months = parseInt(parts[1] || "6", 10);
        const history = await getCostHistory(months);
        await sendResponse(ctx, history);
      } else if (subcommand === "profit") {
        const months = parseInt(parts[1] || "6", 10);
        const summary = await getProfitSummary(months);
        await sendResponse(ctx, summary);
      } else if (subcommand === "help") {
        await ctx.reply(
          "비용 추적 명령어:\n\n" +
            "/cost — 현재 비용 확인\n" +
            "/cost add 5000 server — 비용 추가\n" +
            "/cost history — 월별 비용 이력\n" +
            "/cost profit — 손익 요약\n" +
            "/cost help — 도움말"
        );
      } else {
        await ctx.reply("알 수 없는 명령어입니다. /cost help 를 입력하세요.");
      }
    } catch (err) {
      await ctx.reply(`오류: ${err}`);
    }
  });

  // Standalone forecast command
  bot.command("forecast", async (ctx) => {
    try {
      const forecast = await getRevenueForecast();
      await sendResponse(ctx, forecast);
    } catch (err) {
      await ctx.reply(`오류: ${err}`);
    }
  });

  // Revenue insights command with action buttons
  bot.command("insights", async (ctx) => {
    try {
      const insights = await getInsightsWithActions();

      if (insights.length === 0) {
        await ctx.reply("분석할 데이터가 부족합니다.");
        return;
      }

      await ctx.reply("💡 수익 인사이트:");

      for (let i = 0; i < insights.length; i++) {
        const insight = insights[i];
        const icon = insight.category === "growth" ? "🟢" :
                     insight.category === "warning" ? "🔴" :
                     insight.category === "cost" ? "🟡" : "🔵";

        let message = `${icon} ${insight.title}\n${insight.description}`;
        if (insight.action) {
          message += `\n→ ${insight.action}`;
        }

        // Add action buttons if actionType is defined
        if (insight.actionType && insight.actionType !== "none") {
          const buttons = getInsightActionButtons(i, insight.actionType);
          await ctx.reply(message, { reply_markup: buttons });
        } else {
          await ctx.reply(message);
        }
      }
    } catch (err) {
      await ctx.reply(`오류: ${err}`);
    }
  });

  // Helper function to create insight action buttons
  function getInsightActionButtons(index: number, actionType: InsightActionType): InlineKeyboard {
    const kb = new InlineKeyboard();

    switch (actionType) {
      case "sync":
        kb.text("🔄 동기화", `insight_sync_${index}`);
        break;
      case "target":
        kb.text("🎯 목표 설정", `insight_target_${index}`);
        break;
      case "diversify":
        kb.text("➕ 수익원 추가", `insight_diversify_${index}`);
        break;
      case "cost_optimize":
        kb.text("💰 비용 검토", `insight_cost_${index}`);
        break;
      case "write_blog":
        kb.text("✍️ 블로그 작성", `insight_blog_${index}`);
        break;
      case "review_coin":
        kb.text("📊 코인 전략 검토", `insight_coin_${index}`);
        break;
    }

    return kb;
  }

  // Blog automation command - directly trigger blog post generation
  bot.command("blog", async (ctx) => {
    const args = ctx.match?.trim() || "";
    const parts = args.split(" ");
    const subcommand = parts[0].toLowerCase();

    try {
      if (!subcommand || subcommand === "help") {
        await ctx.reply(
          "✍️ 블로그 자동화 명령어:\n\n" +
            "/blog auto <키워드> — 키워드로 글 작성\n" +
            "예: /blog auto passive income\n\n" +
            "/blog idea <아이디어> — 아이디어로 글 작성\n" +
            "예: /blog idea 부업 아이디어\n\n" +
            "/blog status — 진행 중인 글 확인\n\n" +
            `📝 ${BLOG_ADMIN_URL}에서 승인/반려`
        );
        return;
      }

      if (subcommand === "auto") {
        // /blog auto <keyword>
        const keyword = parts.slice(1).join(" ");
        if (!keyword) {
          await ctx.reply("사용법: /blog auto <키워드>\n예: /blog auto passive income");
          return;
        }

        await ctx.reply("✍️ 블로그 글 생성 중... (1/3 - 키워드 분석)");

        try {
          // Step 1: Enrich keyword
          const enrichRes = await fetch(`${PIPELINE_API}/api/n8n/enrich-keyword`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword }),
          });

          if (!enrichRes.ok) {
            throw new Error(`키워드 분석 실패: ${enrichRes.status}`);
          }

          const enrichData = await enrichRes.json();
          await ctx.reply("✍️ 블로그 글 생성 중... (2/3 - 본문 작성)");

          // Step 2: Generate content
          const generateRes = await fetch(`${PIPELINE_API}/api/n8n/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: enrichData.keyword,
              direction: enrichData.context,
              trend_data: enrichData.trend_data,
              search_insights: enrichData.search_insights,
            }),
          });

          if (!generateRes.ok) {
            throw new Error(`본문 생성 실패: ${generateRes.status}`);
          }

          const generateData = await generateRes.json();
          await ctx.reply("✍️ 블로그 글 생성 중... (3/3 - 저장)");

          // Step 3: Save draft
          const saveRes = await fetch(`${PIPELINE_API}/api/n8n/save-draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: generateData.keyword,
              title: generateData.title,
              slug: generateData.slug,
              content: generateData.content,
              excerpt: generateData.excerpt,
              tags: generateData.tags,
              outline: generateData.outline,
            }),
          });

          if (!saveRes.ok) {
            throw new Error(`저장 실패: ${saveRes.status}`);
          }

          const saveData = await saveRes.json();

          await ctx.reply(
            `✍️ 블로그 글 생성 완료!\n\n` +
            `제목: ${generateData.title}\n` +
            `키워드: ${keyword}\n` +
            `ID: ${saveData.draft_id}\n\n` +
            `📝 ${BLOG_ADMIN_URL}에서 확인 후 승인`
          );
        } catch (err) {
          console.error("[blog] Error:", err);
          await ctx.reply(`오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}\n\ncontent-pipeline 서버가 실행 중인지 확인해주세요.`);
        }
        return;
      }

      if (subcommand === "idea") {
        // /blog idea <idea>
        const idea = parts.slice(1).join(" ");
        if (!idea) {
          await ctx.reply("사용법: /blog idea <아이디어>\n예: /blog idea 부업 아이디어");
          return;
        }

        await ctx.reply("✍️ 블로그 글 생성 중... (1/3 - 아이디어 분석)");

        try {
          // Step 1: Enrich context (extract keywords from idea)
          const enrichRes = await fetch(`${PIPELINE_API}/api/n8n/enrich-context`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ context: idea }),
          });

          if (!enrichRes.ok) {
            throw new Error(`아이디어 분석 실패: ${enrichRes.status}`);
          }

          const enrichData = await enrichRes.json();
          const selectedKeyword = enrichData.selected_keyword || enrichData.keywords?.[0] || idea;
          await ctx.reply(`✍️ 추출된 키워드: ${selectedKeyword}\n✍️ 블로그 글 생성 중... (2/3 - 본문 작성)`);

          // Step 2: Generate content
          const generateRes = await fetch(`${PIPELINE_API}/api/n8n/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: selectedKeyword,
              direction: enrichData.context,
              trend_data: enrichData.trend_data,
              search_insights: enrichData.search_insights,
            }),
          });

          if (!generateRes.ok) {
            throw new Error(`본문 생성 실패: ${generateRes.status}`);
          }

          const generateData = await generateRes.json();
          await ctx.reply("✍️ 블로그 글 생성 중... (3/3 - 저장)");

          // Step 3: Save draft
          const saveRes = await fetch(`${PIPELINE_API}/api/n8n/save-draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: generateData.keyword,
              title: generateData.title,
              slug: generateData.slug,
              content: generateData.content,
              excerpt: generateData.excerpt,
              tags: generateData.tags,
              outline: generateData.outline,
            }),
          });

          if (!saveRes.ok) {
            throw new Error(`저장 실패: ${saveRes.status}`);
          }

          const saveData = await saveRes.json();

          await ctx.reply(
            `✍️ 블로그 글 생성 완료!\n\n` +
            `제목: ${generateData.title}\n` +
            `키워드: ${selectedKeyword}\n` +
            `ID: ${saveData.draft_id}\n\n` +
            `📝 ${BLOG_ADMIN_URL}에서 확인 후 승인`
          );
        } catch (err) {
          console.error("[blog] Error:", err);
          await ctx.reply(`오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}\n\ncontent-pipeline 서버가 실행 중인지 확인해주세요.`);
        }
        return;
      }

      if (subcommand === "status") {
        await ctx.reply(`📝 진행 중인 글은 ${BLOG_ADMIN_URL}에서 확인하세요.`);
        return;
      }

      await ctx.reply("알 수 없는 명령어입니다. /blog help 를 입력하세요.");
    } catch (err) {
      await ctx.reply(`오류: ${err}`);
    }
  });

  // Auto actions command
  bot.command("actions", async (ctx) => {
    const args = ctx.match?.trim() || "";
    try {
      if (args === "clear") {
        await clearAutoActions();
        await ctx.reply("자동 조치가 초기화되었습니다.");
      } else {
        const actions = await getFormattedAutoActions();
        await sendResponse(ctx, actions);
      }
    } catch (err) {
      await ctx.reply(`오류: ${err}`);
    }
  });

  // Acknowledge actions
  bot.command("actions_ack", async (ctx) => {
    const args = ctx.match?.trim() || "";
    try {
      if (args === "all") {
        const count = await acknowledgeAllActions();
        await ctx.reply(`✅ ${count}개 조치 확인 완료`);
      } else if (args) {
        const success = await acknowledgeAction(args);
        if (success) {
          await ctx.reply(`✅ 조치 확인 완료: ${args}`);
        } else {
          await ctx.reply(`❌ 조치를 찾을 수 없음: ${args}`);
        }
      } else {
        const count = await getNewActionsCount();
        await ctx.reply(`미확인 조치: ${count}개\n/ actions_ack all - 전체 확인\n/actions_ack <id> - 개별 확인`);
      }
    } catch (err) {
      await ctx.reply(`오류: ${err}`);
    }
  });

  bot.command("stop", async (ctx) => {
    try {
      await pipelineApi("/api/heartbeat/stop", "POST");
      await ctx.reply("Agent stopped. Use /resume_agent to restart.");
    } catch (err) {
      await ctx.reply(`Failed to stop agent: ${err}`);
    }
  });

  bot.command("resume_agent", async (ctx) => {
    try {
      await pipelineApi("/api/heartbeat/resume", "POST");
      await ctx.reply("Agent resumed.");
    } catch (err) {
      await ctx.reply(`Failed to resume agent: ${err}`);
    }
  });

  bot.command("goals", async (ctx) => {
    try {
      const goals = await pipelineApi("/api/goals");
      const active = Array.isArray(goals)
        ? goals.filter((g: any) => g.status === "active")
        : [];
      if (active.length === 0) {
        await ctx.reply("활성 목표가 없습니다.");
        return;
      }
      const lines = ["Active Goals:"];
      for (const g of active) {
        const prio = g.priority === "high" ? "★" : g.priority === "medium" ? "●" : "○";
        const shared = g.projects.length > 1 ? ` [${g.projects.join(",")}]` : ` [${g.projects[0]}]`;
        const deadline = g.deadline ? ` (by ${g.deadline})` : "";
        lines.push(`${prio} ${g.title}${shared}${deadline}`);
        if (g.progress) lines.push(`   → ${g.progress}`);
      }
      await sendResponse(ctx, lines.join("\n"));
    } catch (err) {
      await ctx.reply(`Failed to fetch goals: ${err}`);
    }
  });

  bot.command("idle_on", async (ctx) => {
    try {
      await pipelineApi("/api/toggle/idle", "POST", { enabled: true });
      await ctx.reply("Idle exploration enabled.");
    } catch (err) {
      await ctx.reply(`Failed: ${err}`);
    }
  });
  bot.command("idle_off", async (ctx) => {
    try {
      await pipelineApi("/api/toggle/idle", "POST", { enabled: false });
      await ctx.reply("Idle exploration disabled.");
    } catch (err) {
      await ctx.reply(`Failed: ${err}`);
    }
  });
  bot.command("chain_on", async (ctx) => {
    try {
      await pipelineApi("/api/toggle/chain", "POST", { enabled: true });
      await ctx.reply("Task chaining enabled.");
    } catch (err) {
      await ctx.reply(`Failed: ${err}`);
    }
  });
  bot.command("chain_off", async (ctx) => {
    try {
      await pipelineApi("/api/toggle/chain", "POST", { enabled: false });
      await ctx.reply("Task chaining disabled.");
    } catch (err) {
      await ctx.reply(`Failed: ${err}`);
    }
  });

  bot.command("monitors", async (ctx) => {
    try {
      const data = await pipelineApi("/api/monitors");
      const monitors = data.monitors || [];
      if (monitors.length === 0) {
        await ctx.reply("Monitors not configured.");
        return;
      }
      let healthy = 0;
      let total = 0;
      const lines: string[] = [];
      for (const m of monitors) {
        const indicator = m.enabled ? "●" : "○";
        const failEntries = Object.entries(m.failures || {});
        const failStr = failEntries.length > 0
          ? ` — ${failEntries.map(([k, v]) => `${k}: ${v}`).join(", ")}`
          : "";
        lines.push(`${indicator} ${m.name}${failStr}`);
        // Count healthy endpoints (simplified)
        total++;
        if (failEntries.length === 0) healthy++;
      }
      await sendResponse(ctx, [`Monitor Status: ${healthy}/${total} healthy`, ...lines].join("\n"));
    } catch (err) {
      await ctx.reply(`Failed to fetch monitors: ${err}`);
    }
  });

  bot.command("approve", async (ctx) => {
    const searchText = ctx.match?.toString().trim();
    if (!searchText) {
      await ctx.reply("사용법: /approve <태스크 ID 앞 8자리>");
      return;
    }

    try {
      await pipelineApi(`/api/agent-tasks/${searchText}/approve`, "POST");
      await ctx.reply(`승인 완료. 다음 heartbeat tick에서 실행됩니다.`);
    } catch (err) {
      await ctx.reply(`승인 실패: ${err}`);
    }
  });

  bot.command("approve_all", async (ctx) => {
    try {
      const result = await pipelineApi("/api/agent-tasks/approve-all", "POST");
      await ctx.reply(`✓ ${result.count || 0}건 전체 승인 완료.`);
    } catch (err) {
      await ctx.reply(`전체 승인 실패: ${err}`);
    }
  });

  bot.command("pending", async (ctx) => {
    try {
      const tasks = await pipelineApi("/api/agent-tasks?active_only=true");
      const pending = (tasks || []).filter((t: any) => t.requires_approval);
      if (pending.length === 0) {
        await ctx.reply("승인 대기 중인 태스크가 없습니다.");
        return;
      }
      for (const t of pending) {
        const keyboard = new InlineKeyboard()
          .text("✓ 승인", `app_${t.id.slice(0, 8)}`)
          .text("✗ 거절", `rej_${t.id.slice(0, 8)}`);
        const project = t.project ? ` [${t.project}]` : "";
        await ctx.reply(`⏳ ${t.title}${project}`, { reply_markup: keyboard });
      }
    } catch (err) {
      await ctx.reply(`Failed: ${err}`);
    }
  });

  // --- Callback query handlers (inline buttons) ---

  bot.callbackQuery(/^app_(.+)$/, async (ctx) => {
    const idPrefix = ctx.match[1];
    try {
      await pipelineApi(`/api/agent-tasks/${idPrefix}/approve`, "POST");
      await ctx.answerCallbackQuery({ text: "✓ 승인 완료!" });
      await ctx.editMessageText(`✓ 승인됨`);
    } catch {
      await ctx.answerCallbackQuery({ text: "처리 실패" });
    }
  });

  bot.callbackQuery(/^rej_(.+)$/, async (ctx) => {
    const idPrefix = ctx.match[1];
    try {
      await pipelineApi(`/api/agent-tasks/${idPrefix}/cancel`, "POST");
      await ctx.answerCallbackQuery({ text: "✗ 거절됨" });
      await ctx.editMessageText(`✗ 거절됨`);
    } catch {
      await ctx.answerCallbackQuery({ text: "처리 실패" });
    }
  });

  // Insight action callback handlers
  bot.callbackQuery(/^insight_sync_/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery({ text: "🔄 동기화 시작..." });
      const result = await syncAllRevenue();
      await ctx.editMessageText(`✓ 동기화 완료:\n${result}`);
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `오류: ${err}` });
    }
  });

  bot.callbackQuery(/^insight_target_/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery({ text: "🎯 목표 설정으로 이동" });
      await ctx.editMessageText("🎯 월 목표를 설정하려면:\n/revenue set [금액]\n\n예: /revenue set 5000000");
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `오류: ${err}` });
    }
  });

  bot.callbackQuery(/^insight_diversify_/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery({ text: "➕ 수익원 추가" });
      await ctx.editMessageText("➕ 새 수익원을 추가하려면:\n/revenue add [금액] [출처]\n\n예: /revenue add 1000000 유튜버");
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `오류: ${err}` });
    }
  });

  bot.callbackQuery(/^insight_cost_/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery({ text: "💰 비용 검토" });
      const status = await getCostStatus();
      await ctx.editMessageText(`💰 비용 현황:\n${status}\n\n비용을 추가하려면:\n/cost add [금액] [카테고리]`);
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `오류: ${err}` });
    }
  });

  bot.callbackQuery(/^insight_blog_/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery({ text: "✍️ 블로그 자동화 요청..." });

      const idea = "사용자 수익 인사이트 기반 콘텐츠: 수익 목표 달성 방법";

      try {
        // Enrich context first
        const enrichRes = await fetch(`${PIPELINE_API}/api/n8n/enrich-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: idea }),
        });

        if (!enrichRes.ok) {
          throw new Error(`분석 실패: ${enrichRes.status}`);
        }

        const enrichData = await enrichRes.json();
        const keyword = enrichData.selected_keyword || "수익 분석";

        // Generate content
        const generateRes = await fetch(`${PIPELINE_API}/api/n8n/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword,
            direction: enrichData.context,
            trend_data: enrichData.trend_data,
            search_insights: enrichData.search_insights,
          }),
        });

        if (!generateRes.ok) {
          throw new Error(`생성 실패: ${generateRes.status}`);
        }

        const generateData = await generateRes.json();

        // Save draft
        const saveRes = await fetch(`${PIPELINE_API}/api/n8n/save-draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: generateData.keyword,
            title: generateData.title,
            slug: generateData.slug,
            content: generateData.content,
            excerpt: generateData.excerpt,
            tags: generateData.tags,
            outline: generateData.outline,
          }),
        });

        if (!saveRes.ok) {
          throw new Error(`저장 실패: ${saveRes.status}`);
        }

        const saveData = await saveRes.json();

        await ctx.editMessageText(
          `✍️ 블로그 글 생성 완료!\n\n` +
          `제목: ${generateData.title}\n` +
          `키워드: ${keyword}\n` +
          `ID: ${saveData.draft_id}\n\n` +
          `📝 ${BLOG_ADMIN_URL}에서 확인 후 승인`
        );
      } catch (err) {
        await ctx.editMessageText(
          `✍️ 블로그 자동화 실패.\n\n${err instanceof Error ? err.message : "알 수 없는 오류"}\n\n` +
          `content-pipeline 서버가 실행 중인지 확인해주세요.\n` +
          `수동으로 작성하려면: /blog auto [주제]`
        );
      }
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `오류: ${err}` });
    }
  });

  bot.callbackQuery(/^insight_coin_/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery({ text: "📊 코인 전략 분석 중..." });

      // Fetch coin portfolio summary
      const COIN_API = process.env.COIN_API_URL || "http://localhost:8001";
      const INTERNAL_KEY = process.env.INTERNAL_API_KEY || "dev-secret";

      try {
        const response = await fetch(`${COIN_API}/portfolio/summary`, {
          headers: {
            "Authorization": `Bearer ${INTERNAL_KEY}`,
            "X-Internal-Key": INTERNAL_KEY,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const totalEquity = data.total_equity || 0;
          const totalProfit = data.total_profit_loss || 0;
          const profitRate = data.profit_rate || 0;

          const emoji = profitRate >= 0 ? "📈" : "📉";
          const profitSign = profitRate >= 0 ? "+" : "";

          let message = `📊 COIN 현재 상태:\n`;
          message += `└ 총 자산: ₩${totalEquity.toLocaleString()}\n`;
          message += `${emoji} 수익: ₩${totalProfit.toLocaleString()} (${profitSign}${profitRate.toFixed(2)}%)\n\n`;

          if (profitRate < -10) {
            message += `⚠️ 손실률이 높습니다. 전략 검토가 필요합니다.\n`;
            message += `→ 대시보드에서 상세 분석: ${DASHBOARD_URL}`;
          } else if (profitRate >= 10) {
            message += `✅ 수익률이 좋습니다. 현재 전략을 유지하세요.`;
          } else {
            message += `→ 대시보드에서 상세 분석: ${DASHBOARD_URL}`;
          }

          await ctx.editMessageText(message);
        } else {
          await ctx.editMessageText("📊 COIN API 연결 실패.\n\n대시보드에서 확인: ${DASHBOARD_URL}");
        }
      } catch (err) {
        await ctx.editMessageText("📊 COIN 서버 연결 실패.\n\n대시보드에서 확인: ${DASHBOARD_URL}");
      }
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `오류: ${err}` });
    }
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

        const cleanResponse = await processMemoryTags(result.result);

        saveMessage(chatId, "assistant", cleanResponse, {
          costUsd: result.costUsd,
          durationMs: result.durationMs,
        });

        // Fallback 세션 ID가 생성된 경우 SessionTracker에 반영
        if (result.sessionId !== sessionId) {
          console.log(`Session ID changed for chat ${chatId}: ${sessionId.slice(0, 8)} → ${result.sessionId.slice(0, 8)}`);
          await sessions.updateSessionId(chatId, result.sessionId);
        }

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
