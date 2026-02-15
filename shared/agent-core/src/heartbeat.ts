import type { TaskStore } from "./tasks";
import type { ForbiddenActions } from "./forbidden";
import type { AuditLog } from "./audit";
import type { AgentTask, ChannelMap, HeartbeatConfig, PlatformAdapter } from "./types";

export interface HeartbeatDeps {
  taskStore: TaskStore;
  forbidden: ForbiddenActions;
  audit: AuditLog;
  platform: PlatformAdapter;
  config: HeartbeatConfig;
  notifyChatId: string;
  channelMap?: ChannelMap;
  executeTask: (task: AgentTask) => Promise<{ result: string; costUsd?: number; durationMs?: number }>;
}

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private deps: HeartbeatDeps;

  constructor(deps: HeartbeatDeps) {
    this.deps = deps;
  }

  start(): void {
    this.stopped = false;
    console.log(
      `[heartbeat] Started (interval: ${this.deps.config.intervalMs / 1000}s)`
    );

    // Run first tick after a short delay
    setTimeout(() => this.tick(), 5000);

    this.timer = setInterval(
      () => this.tick(),
      this.deps.config.intervalMs
    );
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[heartbeat] Stopped");
  }

  isStopped(): boolean {
    return this.stopped;
  }

  resume(): void {
    if (this.stopped) {
      this.start();
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    try {
      // Check quiet hours
      if (this.isQuietHours()) return;

      // Check daily budget
      const todayCost = await this.deps.audit.getTodayCost(
        this.deps.config.timezone
      );
      if (todayCost >= this.deps.config.dailyBudgetUsd) {
        console.log(
          `[heartbeat] Daily budget exceeded ($${todayCost.toFixed(2)} / $${this.deps.config.dailyBudgetUsd})`
        );
        return;
      }

      // Check rate limit
      const recentCount =
        await this.deps.audit.getProactiveCountLastHour();
      if (recentCount >= this.deps.config.maxProactivePerHour) {
        console.log(
          `[heartbeat] Rate limit reached (${recentCount}/${this.deps.config.maxProactivePerHour} per hour)`
        );
        return;
      }

      // Get due tasks
      const dueTasks = this.deps.taskStore.getDueTasks();
      if (dueTasks.length === 0) return;

      console.log(`[heartbeat] ${dueTasks.length} task(s) due`);

      for (const task of dueTasks) {
        if (this.stopped) break;
        await this.executeTask(task);
      }
    } catch (err) {
      console.error("[heartbeat] Tick error:", err);
    }
  }

  private async executeTask(task: AgentTask): Promise<void> {
    // Check if approval required
    if (task.requires_approval) {
      const targetChatId = this.getTargetChatId(task);
      await this.deps.platform.sendMessage(
        targetChatId,
        `[AUTO/${task.project}] 승인 필요: "${task.title}"\n실행하려면 /approve ${task.id.slice(0, 8)}`
      );
      return;
    }

    // Mark as running
    this.deps.taskStore.updateStatus(task.id, "running");
    console.log(`[heartbeat] Executing task: ${task.title}`);

    try {
      const { result, costUsd, durationMs } =
        await this.deps.executeTask(task);

      // Complete the run (handles recurring re-scheduling)
      this.deps.taskStore.completeRun(task.id, result, costUsd);

      // Audit
      await this.deps.audit.record({
        ts: new Date().toISOString(),
        type: "heartbeat",
        task: task.title,
        violations: [],
        cost: costUsd,
        duration: durationMs,
      });

      // Notify user if configured — route to project channel if mapped
      if (task.notify_user && result) {
        const targetChatId = this.getTargetChatId(task);
        const prefix = `[AUTO/${task.project}] `;
        const message =
          result.length > 3800
            ? prefix + result.slice(0, 3800) + "..."
            : prefix + result;
        await this.deps.platform.sendMessage(targetChatId, message);
      }

      console.log(
        `[heartbeat] Task "${task.title}" completed ($${costUsd?.toFixed(4) || "0"})`
      );
    } catch (err) {
      console.error(`[heartbeat] Task "${task.title}" failed:`, err);
      this.deps.taskStore.updateStatus(task.id, "failed");

      // Notify user of failure
      const targetChatId = this.getTargetChatId(task);
      await this.deps.platform.sendMessage(
        targetChatId,
        `[AUTO/${task.project}] 태스크 실패: "${task.title}"\n${String(err).slice(0, 200)}`
      );

      await this.deps.audit.record({
        ts: new Date().toISOString(),
        type: "heartbeat",
        task: task.title,
        violations: [],
      });
    }
  }

  /** Resolve the target chat/channel ID for a task based on its project */
  private getTargetChatId(task: AgentTask): string {
    if (this.deps.channelMap && task.project) {
      const mapped = this.deps.channelMap[task.project];
      if (mapped) return mapped;
    }
    return this.deps.notifyChatId;
  }

  private isQuietHours(): boolean {
    const { quietHoursStart, quietHoursEnd, timezone } = this.deps.config;
    const now = new Date();
    const hour = parseInt(
      now.toLocaleString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }),
      10
    );

    if (quietHoursStart > quietHoursEnd) {
      // e.g., 23:00 - 08:00 (crosses midnight)
      return hour >= quietHoursStart || hour < quietHoursEnd;
    }
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }

  /** Fire event-triggered tasks */
  async fireEvent(eventName: string): Promise<void> {
    if (this.stopped) return;

    const tasks = this.deps.taskStore.getEventTasks(eventName);
    for (const task of tasks) {
      await this.executeTask(task);
    }
  }
}
