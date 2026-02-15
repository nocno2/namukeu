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
