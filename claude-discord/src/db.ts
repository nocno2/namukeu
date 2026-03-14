import { Database } from "bun:sqlite";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const DB_PATH = join(DATA_DIR, "messages.db");

let db: Database;

export function initDb(): void {
  db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id, created_at DESC)
  `);

  // Channel settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_settings (
      channel_id TEXT PRIMARY KEY,
      engine TEXT NOT NULL DEFAULT 'claude',
      model TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Global settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function saveMessage(
  channelId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown>
): void {
  db.run(
    `INSERT INTO messages (channel_id, role, content, created_at, metadata) VALUES (?, ?, ?, ?, ?)`,
    [
      channelId,
      role,
      content,
      new Date().toISOString(),
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

export interface MessageRow {
  id: number;
  channel_id: string;
  role: string;
  content: string;
  created_at: string;
  metadata: string | null;
}

export function getRecentMessages(
  channelId: string,
  limit: number = 20
): MessageRow[] {
  return db
    .query(
      `SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(channelId, limit) as MessageRow[];
}

export function searchMessages(
  channelId: string,
  query: string,
  limit: number = 20
): MessageRow[] {
  return db
    .query(
      `SELECT * FROM messages WHERE channel_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(channelId, `%${query}%`, limit) as MessageRow[];
}

export function getMessageCount(channelId: string): number {
  const row = db
    .query(`SELECT COUNT(*) as count FROM messages WHERE channel_id = ?`)
    .get(channelId) as { count: number };
  return row.count;
}

/**
 * Build a conversation recap from recent DB messages for new session context.
 * Returns empty string if no history exists.
 */
export function getConversationRecap(
  channelId: string,
  limit: number = 30
): string {
  const messages = getRecentMessages(channelId, limit);
  if (messages.length === 0) return "";

  // Reverse to chronological order
  messages.reverse();

  const lines = messages.map((m) => {
    const content =
      m.content.length > 300 ? m.content.slice(0, 300) + "..." : m.content;
    return `${m.role === "user" ? "User" : "Assistant"}: ${content}`;
  });

  return (
    "PREVIOUS CONVERSATION RECAP (from before session reset):\n" +
    "Below is a summary of recent messages. Use this to maintain continuity.\n\n" +
    lines.join("\n\n")
  );
}

// ─── Channel Settings ───

export interface ChannelSetting {
  channel_id: string;
  engine: string;
  model: string | null;
  updated_at: string;
}

export function getAllChannelSettings(): ChannelSetting[] {
  const rows = db.query("SELECT channel_id, engine, model, updated_at FROM channel_settings").all();
  return rows as ChannelSetting[];
}

export function getChannelSetting(channelId: string): ChannelSetting | null {
  const row = db.query("SELECT channel_id, engine, model, updated_at FROM channel_settings WHERE channel_id = ?").get(channelId);
  return row as ChannelSetting | null;
}

export function setChannelEngine(channelId: string, engine: string, model?: string): void {
  db.run(
    `INSERT OR REPLACE INTO channel_settings (channel_id, engine, model, updated_at) VALUES (?, ?, ?, datetime('now'))`,
    [channelId, engine, model || null]
  );
}

export function deleteChannelSetting(channelId: string): void {
  db.run("DELETE FROM channel_settings WHERE channel_id = ?", [channelId]);
}

// ─── Global Settings ───

export function getGlobalSetting(key: string): string | null {
  const row = db.query("SELECT value FROM global_settings WHERE key = ?").get(key) as { value: string } | null;
  return row?.value || null;
}

export function setGlobalSetting(key: string, value: string): void {
  db.run(
    `INSERT OR REPLACE INTO global_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
    [key, value]
  );
}

// ─── Channel List from Messages ───

export interface ChannelInfo {
  channel_id: string;
  last_message_at: string | null;
}

export function getKnownChannels(): ChannelInfo[] {
  const rows = db.query(`
    SELECT channel_id, MAX(created_at) as last_message_at
    FROM messages
    GROUP BY channel_id
    ORDER BY last_message_at DESC
  `).all();
  return rows as ChannelInfo[];
}
