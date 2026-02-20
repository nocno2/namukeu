import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { AgentEngine } from "@namukeu/agent-core";

const SETTINGS_FILE = join(process.cwd(), "data", "channel-settings.json");

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

export async function loadSettings(): Promise<DcBotSettings> {
  if (cachedSettings) return cachedSettings;

  try {
    const content = await readFile(SETTINGS_FILE, "utf-8");
    cachedSettings = JSON.parse(content);
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }

  return cachedSettings!;
}

export async function saveSettings(settings: DcBotSettings): Promise<void> {
  cachedSettings = settings;
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export function getChannelEngine(channelId: string): AgentEngine {
  const settings = cachedSettings || { channels: {}, defaultEngine: "claude" };
  return settings.channels[channelId]?.engine || settings.defaultEngine;
}

export async function setChannelEngine(
  channelId: string,
  engine: AgentEngine
): Promise<void> {
  const settings = await loadSettings();
  settings.channels[channelId] = { engine };
  await saveSettings(settings);
}

export async function setDefaultEngine(engine: AgentEngine): Promise<void> {
  const settings = await loadSettings();
  settings.defaultEngine = engine;
  await saveSettings(settings);
}
