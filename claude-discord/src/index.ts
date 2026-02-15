import { mkdir } from "fs/promises";
import { join } from "path";
import { acquireLock, releaseLock } from "./session";
import { createBot } from "./bot";
import { startPlaywrightMCP, stopPlaywrightMCP } from "@namukeu/playwright-mcp";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const UPLOADS_DIR = join(import.meta.dir, "..", "uploads");

function validateConfig(): void {
  const required = ["DISCORD_BOT_TOKEN", "DISCORD_USER_ID"];
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
    await stopPlaywrightMCP();
    await releaseLock();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  const client = await createBot();

  console.log("Claude Discord Relay starting...");
  await client.login(process.env.DISCORD_BOT_TOKEN!);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
