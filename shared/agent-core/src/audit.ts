import { appendFile, readFile } from "fs/promises";
import type { AuditEntry } from "./types";

export class AuditLog {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  async record(entry: AuditEntry): Promise<void> {
    const line = JSON.stringify(entry) + "\n";
    await appendFile(this.logPath, line);
  }

  async getRecent(limit: number = 20): Promise<AuditEntry[]> {
    try {
      const raw = await readFile(this.logPath, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      return lines
        .slice(-limit)
        .map((l) => JSON.parse(l))
        .reverse();
    } catch {
      return [];
    }
  }

  async getTodayCost(timezone: string): Promise<number> {
    const entries = await this.getRecent(200);
    const now = new Date();
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD

    let total = 0;
    for (const entry of entries) {
      const entryDate = new Date(entry.ts).toLocaleDateString("en-CA", {
        timeZone: timezone,
      });
      if (entryDate === todayStr && entry.cost) {
        total += entry.cost;
      }
    }
    return total;
  }

  async getProactiveCountLastHour(): Promise<number> {
    const entries = await this.getRecent(100);
    const oneHourAgo = Date.now() - 3600_000;

    return entries.filter(
      (e) =>
        e.type === "heartbeat" &&
        new Date(e.ts).getTime() > oneHourAgo
    ).length;
  }
}
