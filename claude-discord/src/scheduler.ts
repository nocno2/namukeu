import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const SCHEDULE_FILE = join(DATA_DIR, "schedules.json");

export interface ScheduledTask {
  id: string;
  channelId: string;
  name: string;
  /** Cron-like interval in minutes */
  intervalMinutes: number;
  /** What to do — sent as a prompt to the channel */
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
  /** Optional: quiet hours (23-08 KST by default) */
  respectQuietHours: boolean;
}

interface ScheduleStore {
  tasks: ScheduledTask[];
}

let store: ScheduleStore = { tasks: [] };
let tickInterval: ReturnType<typeof setInterval> | null = null;
let onTaskDue: ((task: ScheduledTask) => Promise<void>) | null = null;
let onTaskSkip: ((task: ScheduledTask) => Promise<void>) | null = null;

// Track tasks that have been notified during quiet hours (to prevent spam)
const quietHoursSkippedTasks: Set<string> = new Set();

const TICK_INTERVAL_MS = 60_000; // Check every 1 minute
const QUIET_START_HOUR = 23; // 11 PM KST
const QUIET_END_HOUR = 8;   // 8 AM KST
const TIMEZONE = process.env.USER_TIMEZONE || "Asia/Seoul";

async function loadStore(): Promise<void> {
  try {
    const raw = await readFile(SCHEDULE_FILE, "utf-8");
    store = JSON.parse(raw);
  } catch {
    store = { tasks: [] };
  }
}

async function saveStore(): Promise<void> {
  await writeFile(SCHEDULE_FILE, JSON.stringify(store, null, 2));
}

function isQuietHours(): boolean {
  const now = new Date();
  const hour = parseInt(
    now.toLocaleString("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false })
  );
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

function computeNextRun(intervalMinutes: number, fromDate?: Date): string {
  const from = fromDate || new Date();
  return new Date(from.getTime() + intervalMinutes * 60_000).toISOString();
}

async function tick(): Promise<void> {
  if (!onTaskDue) return;

  const now = new Date();
  const quiet = isQuietHours();

  // Clear skip tracking when exiting quiet hours (so notifications can resume)
  if (!quiet && quietHoursSkippedTasks.size > 0) {
    quietHoursSkippedTasks.clear();
  }

  for (const task of store.tasks) {
    if (!task.enabled) continue;
    if (quiet && task.respectQuietHours) {
      // Notify about skipped task only once per quiet hours period
      if (onTaskSkip && !quietHoursSkippedTasks.has(task.id)) {
        quietHoursSkippedTasks.add(task.id);
        try {
          await onTaskSkip(task);
        } catch (err) {
          console.error(`[scheduler] Skip notification failed for "${task.name}":`, err);
        }
      }
      continue;
    }

    const nextRun = new Date(task.nextRunAt);
    if (now >= nextRun) {
      // Mark as running before async execution
      task.lastRunAt = now.toISOString();
      task.nextRunAt = computeNextRun(task.intervalMinutes, now);
      await saveStore();

      try {
        await onTaskDue(task);
      } catch (err) {
        console.error(`[scheduler] Task "${task.name}" failed:`, err);
      }
    }
  }
}

// --- Public API ---

export async function initScheduler(
  callback: (task: ScheduledTask) => Promise<void>,
  onSkip?: (task: ScheduledTask) => Promise<void>
): Promise<void> {
  onTaskDue = callback;
  onTaskSkip = onSkip || null;
  await loadStore();

  // Fix any tasks with past nextRunAt (e.g., after bot restart)
  const now = new Date();
  let changed = false;
  for (const task of store.tasks) {
    if (task.enabled && new Date(task.nextRunAt) < now) {
      // Schedule to run soon (within 2 minutes) instead of immediately flooding
      task.nextRunAt = computeNextRun(2, now);
      changed = true;
    }
  }
  if (changed) await saveStore();

  tickInterval = setInterval(() => {
    tick().catch((err) => console.error("[scheduler] tick error:", err));
  }, TICK_INTERVAL_MS);

  console.log(`[scheduler] Started with ${store.tasks.length} task(s).`);
}

export function stopScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  onTaskDue = null;
  console.log("[scheduler] Stopped.");
}

export async function addTask(params: {
  channelId: string;
  name: string;
  intervalMinutes: number;
  prompt: string;
  respectQuietHours?: boolean;
}): Promise<ScheduledTask> {
  const task: ScheduledTask = {
    id: crypto.randomUUID(),
    channelId: params.channelId,
    name: params.name,
    intervalMinutes: params.intervalMinutes,
    prompt: params.prompt,
    enabled: true,
    lastRunAt: null,
    nextRunAt: computeNextRun(params.intervalMinutes),
    createdAt: new Date().toISOString(),
    respectQuietHours: params.respectQuietHours ?? true,
  };
  store.tasks.push(task);
  await saveStore();
  return task;
}

export async function removeTask(taskId: string): Promise<boolean> {
  const idx = store.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return false;
  store.tasks.splice(idx, 1);
  await saveStore();
  return true;
}

export async function toggleTask(taskId: string): Promise<ScheduledTask | null> {
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  task.enabled = !task.enabled;
  if (task.enabled) {
    // Reset next run when re-enabling
    task.nextRunAt = computeNextRun(task.intervalMinutes);
  }
  await saveStore();
  return task;
}

export function listTasks(): ScheduledTask[] {
  return [...store.tasks];
}

export function getTask(taskId: string): ScheduledTask | undefined {
  return store.tasks.find((t) => t.id === taskId);
}

export function formatTaskList(): string {
  if (store.tasks.length === 0) {
    return "No scheduled tasks.";
  }

  return store.tasks.map((t) => {
    const status = t.enabled ? "✅" : "⬜";
    const quiet = t.respectQuietHours ? "🌙" : "";
    const interval = t.intervalMinutes >= 60
      ? `${Math.floor(t.intervalMinutes / 60)}h${t.intervalMinutes % 60 ? ` ${t.intervalMinutes % 60}m` : ""}`
      : `${t.intervalMinutes}m`;
    const lastRun = t.lastRunAt
      ? new Date(t.lastRunAt).toLocaleString("ko-KR", { timeZone: TIMEZONE, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "없음";
    const nextRun = new Date(t.nextRunAt).toLocaleString("ko-KR", { timeZone: TIMEZONE, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

    return `${status} **${t.name}** ${quiet}\n` +
      `   채널: <#${t.channelId}> | 간격: ${interval}\n` +
      `   마지막: ${lastRun} | 다음: ${nextRun}\n` +
      `   ID: \`${t.id.slice(0, 8)}\``;
  }).join("\n\n");
}
