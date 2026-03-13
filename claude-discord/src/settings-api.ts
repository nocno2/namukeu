// Simple HTTP API for DCBOT settings — runs alongside Discord bot.

import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { AgentEngine } from "@namukeu/agent-core";
import {
  initDb,
  getAllChannelSettings,
  getChannelSetting,
  setChannelEngine as dbSetChannelEngine,
  getGlobalSetting,
  setGlobalSetting,
  getKnownChannels,
} from "./db";

const USAGE_FILE = join(process.cwd(), "data", "usage.json");
const API_PORT = 8090; // DCBOT API port

export interface ChannelSettings {
  engine: AgentEngine;
  model?: string;
}

export interface DcBotSettings {
  channels: Record<string, ChannelSettings>;
  defaultEngine: AgentEngine;
}

const DEFAULT_SETTINGS: DcBotSettings = {
  channels: {},
  defaultEngine: "claude",
};

let cachedSettings: DcBotSettings | null = null;

function loadSettingsFromDb(): DcBotSettings {
  if (cachedSettings) return cachedSettings;

  const channelRows = getAllChannelSettings();
  const channels: Record<string, ChannelSettings> = {};
  for (const row of channelRows) {
    channels[row.channel_id] = { engine: row.engine as AgentEngine, model: row.model || undefined };
  }

  const defaultEngine = (getGlobalSetting("default_engine") || "claude") as AgentEngine;

  cachedSettings = { channels, defaultEngine };
  return cachedSettings;
}

async function loadSettings(): Promise<DcBotSettings> {
  return loadSettingsFromDb();
}

function getChannelEngine(channelId: string): AgentEngine {
  const settings = loadSettingsFromDb();
  return settings.channels[channelId]?.engine || settings.defaultEngine;
}

async function setChannelEngine(
  channelId: string,
  engine: AgentEngine
): Promise<void> {
  dbSetChannelEngine(channelId, engine);
  cachedSettings = null; // Clear cache
}

async function setDefaultEngine(engine: AgentEngine): Promise<void> {
  setGlobalSetting("default_engine", engine);
  cachedSettings = null; // Clear cache
}

// ─── Usage Tracking ───

export interface UsageStats {
  claude: {
    costUsd: number;
    requests: number;
  };
  gemini: {
    tokens: number;
    requests: number;
  };
  lastUpdated: string;
}

const DEFAULT_USAGE: UsageStats = {
  claude: { costUsd: 0, requests: 0 },
  gemini: { tokens: 0, requests: 0 },
  lastUpdated: new Date().toISOString(),
};

let cachedUsage: UsageStats | null = null;

async function loadUsage(): Promise<UsageStats> {
  if (cachedUsage) return cachedUsage;

  try {
    const content = await readFile(USAGE_FILE, "utf-8");
    cachedUsage = JSON.parse(content);
  } catch {
    cachedUsage = { ...DEFAULT_USAGE };
  }

  return cachedUsage!;
}

async function saveUsage(usage: UsageStats): Promise<void> {
  cachedUsage = usage;
  await writeFile(USAGE_FILE, JSON.stringify(usage, null, 2));
}

export async function recordUsage(engine: AgentEngine, tokens?: number, costUsd?: number): Promise<void> {
  const usage = await loadUsage();

  if (engine === "gemini" && tokens) {
    usage.gemini.tokens += tokens;
    usage.gemini.requests += 1;
  } else if (engine === "claude" && costUsd) {
    usage.claude.costUsd += costUsd;
    usage.claude.requests += 1;
  }

  usage.lastUpdated = new Date().toISOString();
  await saveUsage(usage);
}

// ─── HTTP Server ───

interface Request {
  url: string;
  method: string;
  headers: Headers;
}

interface Response {
  status(code: number): Response;
  json(data: any): void;
  text(data: string): void;
}

export async function startSettingsServer(): Promise<void> {
  // Ensure data directory exists
  await mkdir(join(process.cwd(), "data"), { recursive: true });

  // Load initial settings
  await loadSettings();

  const server = Bun.serve({
    port: API_PORT,
    async fetch(req: Request, _res: Response) {
      const url = new URL(req.url, `http://localhost:${API_PORT}`);
      const path = url.pathname;
      const method = req.method;

      // CORS headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      try {
        // GET /channels - get known channels from message history
        if (path === "/channels" && method === "GET") {
          const channels = getKnownChannels();
          return Response.json({ channels }, { headers: corsHeaders });
        }

        // GET /settings - get all settings
        if (path === "/settings" && method === "GET") {
          const settings = await loadSettings();
          return Response.json(settings, { headers: corsHeaders });
        }

        // GET /settings/:channelId - get channel engine
        if (path.startsWith("/settings/") && method === "GET") {
          const channelId = path.split("/")[2];
          const engine = getChannelEngine(channelId);
          return Response.json({ channelId, engine }, { headers: corsHeaders });
        }

        // POST /settings/:channelId - set channel engine
        if (path.startsWith("/settings/") && method === "POST") {
          const channelId = path.split("/")[2];
          const body = await req.json();
          const engine = body.engine as AgentEngine;

          if (engine && (engine === "claude" || engine === "gemini")) {
            await setChannelEngine(channelId, engine);
            return Response.json({ channelId, engine, ok: true }, { headers: corsHeaders });
          }
          return Response.json({ error: "Invalid engine" }, { status: 400, headers: corsHeaders });
        }

        // POST /settings/default - set default engine
        if (path === "/settings/default" && method === "POST") {
          const body = await req.json();
          const engine = body.engine as AgentEngine;

          if (engine && (engine === "claude" || engine === "gemini")) {
            await setDefaultEngine(engine);
            return Response.json({ engine, ok: true }, { headers: corsHeaders });
          }
          return Response.json({ error: "Invalid engine" }, { status: 400, headers: corsHeaders });
        }

        // GET /usage - get usage stats
        if (path === "/usage" && method === "GET") {
          const usage = await loadUsage();
          return Response.json(usage, { headers: corsHeaders });
        }

        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      } catch (err) {
        return Response.json(
          { error: String(err) },
          { status: 500, headers: corsHeaders }
        );
      }
    },
  });

  console.log(`[settings] DCBOT settings API running on http://localhost:${API_PORT}`);
}

// Export for use in bot.ts
export { loadSettings, getChannelEngine };
