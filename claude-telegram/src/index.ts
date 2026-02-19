import { mkdir } from "fs/promises";
import { join } from "path";
import { acquireLock, releaseLock } from "./session";
import { createBot } from "./bot";
import { killActiveChild } from "./claude";
import { startPlaywrightMCP, stopPlaywrightMCP } from "@namukeu/playwright-mcp";
import { getRevenueStatus, checkGoalAlerts, getFormattedDailyReport, generateDailyReport, getFormattedInsights, startAutoSyncScheduler } from "./revenue";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const UPLOADS_DIR = join(import.meta.dir, "..", "uploads");

function validateConfig(): void {
  const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_USER_ID"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }
}

async function ensureDirectories(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOADS_DIR, { recursive: true });
}

// Daily revenue report scheduler
let lastReportDate = "";
let botInstance: any = null;

async function scheduleDailyReport(): Promise<void> {
  const checkAndSendReport = async () => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Only send once per day
    if (lastReportDate === today) return;

    // Check if it's around 8 AM (KST = UTC+9)
    const hour = now.getHours();
    if (hour < 7 || hour > 9) return; // Send between 7-9 AM KST

    try {
      const report = await generateDailyReport();
      if (!botInstance) return;

      const userId = parseInt(process.env.TELEGRAM_USER_ID!, 10);
      let message = report.summary;

      // Add insights
      const insights = await getFormattedInsights();
      if (insights && !insights.includes("분석할 데이터가 부족합니다")) {
        message += "\n\n" + insights;
      }

      if (report.needsAttention && report.alertMessage) {
        message += `\n\n⚠️${report.alertMessage.split("\n").join("\n⚠️ ")}`;
      }

      await botInstance.api.sendMessage(userId, message);
      lastReportDate = today;
      console.log(`[report] Daily revenue report sent for ${today}`);
    } catch (err) {
      console.error("[report] Failed to send daily report:", err);
    }
  };

  // Check every hour
  setInterval(checkAndSendReport, 60 * 60 * 1000);
  // Also check on startup (if it's morning)
  setTimeout(checkAndSendReport, 5000);
}

async function showRevenueStatus(): Promise<void> {
  try {
    const status = await getRevenueStatus();
    console.log("=== Revenue Status ===");
    console.log(status);
    console.log("======================");
  } catch {
    console.log("[revenue] Not initialized yet. Use /revenue set <amount> to set monthly target.");
  }
}

async function main(): Promise<void> {
  validateConfig();
  await ensureDirectories();
  await showRevenueStatus();

  const locked = await acquireLock();
  if (!locked) {
    process.exit(1);
  }

  // Start Playwright MCP daemon
  try {
    await startPlaywrightMCP();
  } catch (err) {
    console.warn("[playwright-mcp] Failed to start:", err);
    console.warn("[playwright-mcp] Browser capabilities will not be available.");
  }

  // Cleanup on exit
  const cleanup = async () => {
    killActiveChild(); // Kill any running Claude CLI child process
    await stopPlaywrightMCP();
    await releaseLock();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  const bot = await createBot();
  botInstance = bot; // Store for daily report scheduler

  // Start daily report scheduler
  scheduleDailyReport();

  // Start auto revenue sync scheduler (daily at 8 AM KST)
  startAutoSyncScheduler((result) => {
    console.log("[auto-sync] Daily sync completed:", result);
  }, 8);

  console.log("Claude Telegram Relay v2 starting...");
  console.log("Agent system delegated to content-pipeline (port 8003)");
  bot.start({
    onStart: async () => {
      console.log("Bot is running. Waiting for messages...");

      // Check goal alerts on startup (delayed to ensure bot is ready)
      setTimeout(async () => {
        try {
          const alert = await checkGoalAlerts();
          if (alert.needsAttention) {
            // Send alert to user (use the configured user ID)
            const userId = parseInt(process.env.TELEGRAM_USER_ID!, 10);
            await bot.api.sendMessage(userId, `📢 수익 알림:\n\n${alert.message}`);
            console.log("[alert] Goal alert sent to user");
          }
        } catch (err) {
          console.error("[alert] Failed to check goal alerts:", err);
        }
      }, 3000); // Wait 3 seconds for bot to fully initialize

      // Heartbeat is now managed by content-pipeline
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
