import { createHash } from "crypto";
import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const LOCK_FILE = join(DATA_DIR, "bot.lock");
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");

// Stable namespace UUID for deterministic UUID v5 generation
const APP_NAMESPACE = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

export interface SessionData {
  chatId: number;
  sessionId: string;
  generation: number;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
}

/**
 * Generate a deterministic UUID v5 from a chat ID and generation number.
 * Same inputs always produce the same UUID.
 */
export function chatIdToSessionId(
  chatId: number,
  generation: number = 0
): string {
  const name = `claude-telegram-${chatId}-gen-${generation}`;
  const nhex = APP_NAMESPACE.replace(/-/g, "");
  const nbytes = Buffer.from(nhex, "hex");
  const hash = createHash("sha1").update(nbytes).update(name).digest();

  // Set version 5 and variant bits per RFC 4122
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export class SessionTracker {
  private sessions: Map<number, SessionData> = new Map();

  async load(): Promise<void> {
    try {
      const raw = await readFile(SESSIONS_FILE, "utf-8");
      const data: SessionData[] = JSON.parse(raw);
      this.sessions = new Map(data.map((s) => [s.chatId, s]));
    } catch {
      // File doesn't exist or is corrupted — start fresh
      this.sessions = new Map();
    }
  }

  private async save(): Promise<void> {
    const data = Array.from(this.sessions.values());
    await writeFile(SESSIONS_FILE, JSON.stringify(data, null, 2));
  }

  getSession(chatId: number): SessionData | undefined {
    return this.sessions.get(chatId);
  }

  isNewSession(chatId: number): boolean {
    const session = this.sessions.get(chatId);
    return !session || session.messageCount === 0;
  }

  getSessionId(chatId: number): string {
    const session = this.sessions.get(chatId);
    const generation = session?.generation ?? 0;
    return chatIdToSessionId(chatId, generation);
  }

  async markActive(chatId: number): Promise<void> {
    const existing = this.sessions.get(chatId);
    if (existing) {
      existing.lastActivity = new Date().toISOString();
      existing.messageCount++;
    } else {
      this.sessions.set(chatId, {
        chatId,
        sessionId: this.getSessionId(chatId),
        generation: 0,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 1,
      });
    }
    await this.save();
  }

  async resetSession(chatId: number): Promise<void> {
    const existing = this.sessions.get(chatId);
    const nextGen = (existing?.generation ?? 0) + 1;
    // New entry with incremented generation and messageCount 0.
    // isNewSession() checks messageCount === 0, so next call uses --session-id.
    this.sessions.set(chatId, {
      chatId,
      sessionId: chatIdToSessionId(chatId, nextGen),
      generation: nextGen,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
    });
    await this.save();
  }
}

// --- Lock file ---

export async function acquireLock(): Promise<boolean> {
  try {
    const existing = await readFile(LOCK_FILE, "utf-8").catch(() => null);

    if (existing) {
      const pid = parseInt(existing, 10);
      try {
        process.kill(pid, 0); // Check if process still running
        console.error(`Another instance is running (PID ${pid}). Exiting.`);
        return false;
      } catch {
        console.log("Found stale lock file. Taking over.");
      }
    }

    await writeFile(LOCK_FILE, process.pid.toString());
    return true;
  } catch (err) {
    console.error("Lock acquisition error:", err);
    return false;
  }
}

export async function releaseLock(): Promise<void> {
  try {
    await unlink(LOCK_FILE);
  } catch {}
}
