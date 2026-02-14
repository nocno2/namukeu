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
      chat_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, created_at DESC)
  `);
}

export function saveMessage(
  chatId: number,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown>
): void {
  db.run(
    `INSERT INTO messages (chat_id, role, content, created_at, metadata) VALUES (?, ?, ?, ?, ?)`,
    [
      chatId,
      role,
      content,
      new Date().toISOString(),
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

export interface MessageRow {
  id: number;
  chat_id: number;
  role: string;
  content: string;
  created_at: string;
  metadata: string | null;
}

export function getRecentMessages(
  chatId: number,
  limit: number = 20
): MessageRow[] {
  return db
    .query(
      `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(chatId, limit) as MessageRow[];
}

export function searchMessages(
  chatId: number,
  query: string,
  limit: number = 20
): MessageRow[] {
  return db
    .query(
      `SELECT * FROM messages WHERE chat_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(chatId, `%${query}%`, limit) as MessageRow[];
}

export function getMessageCount(chatId: number): number {
  const row = db
    .query(`SELECT COUNT(*) as count FROM messages WHERE chat_id = ?`)
    .get(chatId) as { count: number };
  return row.count;
}
