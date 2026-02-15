import { mkdir } from "fs/promises";
import { join } from "path";
import { acquireLock, releaseLock } from "./session";
import { createBot, heartbeat, taskStore, goalStore, auditLog, forbidden } from "./bot";
import { startPlaywrightMCP, stopPlaywrightMCP } from "@namukeu/playwright-mcp";
import { startHttpApi } from "./http-api";

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

async function main(): Promise<void> {
  validateConfig();
  await ensureDirectories();

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
    if (heartbeat) heartbeat.stop();
    await stopPlaywrightMCP();
    await releaseLock();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  const bot = await createBot();

  console.log("Claude Telegram Relay v2 starting...");
  bot.start({
    onStart: () => {
      console.log("Bot is running. Waiting for messages...");

      // Start heartbeat after bot is ready
      if (heartbeat) {
        heartbeat.start();
      }

      // Start HTTP API for dashboard integration
      startHttpApi({ heartbeat, taskStore, goalStore, auditLog, forbidden });
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
