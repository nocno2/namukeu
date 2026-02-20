// Simple HTTP API for DCBOT settings — runs alongside Discord bot.

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { AgentEngine } from "@namukeu/agent-core";

const SETTINGS_FILE = join(process.cwd(), "data", "channel-settings.json");
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

async function loadSettings(): Promise<DcBotSettings> {
  if (cachedSettings) return cachedSettings;

  try {
    const content = await readFile(SETTINGS_FILE, "utf-8");
    cachedSettings = JSON.parse(content);
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }

  return cachedSettings!;
}

async function saveSettings(settings: DcBotSettings): Promise<void> {
  cachedSettings = settings;
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getChannelEngine(channelId: string): AgentEngine {
  const settings = cachedSettings || { channels: {}, defaultEngine: "claude" };
  return settings.channels[channelId]?.engine || settings.defaultEngine;
}

async function setChannelEngine(
  channelId: string,
  engine: AgentEngine
): Promise<void> {
  const settings = await loadSettings();
  settings.channels[channelId] = { engine };
  await saveSettings(settings);
}

async function setDefaultEngine(engine: AgentEngine): Promise<void> {
  const settings = await loadSettings();
  settings.defaultEngine = engine;
  await saveSettings(settings);
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
