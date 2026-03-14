import { mkdir, readdir, rm } from "fs/promises";
import { join } from "path";
import { acquireLock, releaseLock } from "./session";
import { createBot } from "./bot";
import { startPlaywrightMCP, stopPlaywrightMCP } from "@namukeu/playwright-mcp";
import { stopScheduler } from "./scheduler";
import { killActiveChild } from "./claude";
import { startSettingsServer, loadSettings } from "./settings-api";
import { initDb } from "./db";

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

async function killOrphanClaudeProcesses(): Promise<void> {
  try {
    const proc = Bun.spawn(["pkill", "-f", "claude.*--session-id|claude.*--resume"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
    await Bun.sleep(500);
  } catch {
    // ignore
  }
}

async function cleanStaleSessionLocks(): Promise<void> {
  // claude CLI uses subagents/ dir as a session lock — clean up on startup
  const HOME = process.env.HOME || "";
  const projectsDir = join(HOME, ".claude", "projects");
  try {
    const projects = await readdir(projectsDir);
    for (const project of projects) {
      const projectPath = join(projectsDir, project);
      try {
        const entries = await readdir(projectPath);
        for (const entry of entries) {
          if (entry === "subagents" || !entry.includes("-")) continue;
          const subagentsPath = join(projectPath, entry, "subagents");
          try {
            await rm(subagentsPath, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
    console.log("[startup] Cleared stale claude session locks.");
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  validateConfig();
  await ensureDirectories();
  await killOrphanClaudeProcesses();
  await cleanStaleSessionLocks();

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
    stopScheduler();
    killActiveChild();
    await stopPlaywrightMCP();
    await releaseLock();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Initialize DB (for messages and channel settings)
  initDb();

  // Start settings API server
  await startSettingsServer();
  await loadSettings();

  const client = await createBot();

  console.log("Claude Discord Relay starting...");
  await client.login(process.env.DISCORD_BOT_TOKEN!);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
