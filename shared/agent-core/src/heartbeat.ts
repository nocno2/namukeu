import type { TaskStore } from "./tasks";
import type { ForbiddenActions } from "./forbidden";
import type { AuditLog } from "./audit";
import type { GoalStore } from "./goals";
import type { AgentTask, ChannelMap, HeartbeatConfig, MonitorDefinition, PlatformAdapter } from "./types";
import { MonitorSystem } from "./monitors";
import { selectIdleStrategy, buildIdlePrompt } from "./idle";

export interface HeartbeatDeps {
  taskStore: TaskStore;
  forbidden: ForbiddenActions;
  audit: AuditLog;
  platform: PlatformAdapter;
  config: HeartbeatConfig;
  notifyChatId: string;
  channelMap?: ChannelMap;
  monitors?: MonitorDefinition[];
  goalStore?: GoalStore;
  executeTask: (task: AgentTask) => Promise<{ result: string; costUsd?: number; durationMs?: number }>;
}

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private deps: HeartbeatDeps;

  // Execution guard
  private executing = false;

  // Idle tracking
  private lastTaskExecutedAt: number = Date.now();
  private idleTasksToday: number = 0;
  private idleTasksResetDate: string = new Date().toISOString().slice(0, 10);

  // Monitor system
  private monitorSystem: MonitorSystem | null = null;

  // Feature toggles (initialized from config)
  private idleEnabled: boolean;
  private chainingEnabled: boolean;
  private monitorsEnabled: boolean;

  constructor(deps: HeartbeatDeps) {
    this.deps = deps;
    this.idleEnabled = deps.config.idle?.enabled ?? false;
    this.chainingEnabled = deps.config.chainingEnabled ?? false;
    this.monitorsEnabled = deps.config.monitorsEnabled ?? false;
  }

  start(): void {
    this.stopped = false;
    console.log(
      `[heartbeat] Started (interval: ${this.deps.config.intervalMs / 1000}s)`
    );

    // Start monitor system if monitors provided and enabled
    if (this.monitorsEnabled && this.deps.monitors && this.deps.monitors.length > 0) {
      this.monitorSystem = new MonitorSystem(
        this.deps.monitors,
        (eventName, context) => this.fireEvent(eventName, context)
      );
      this.monitorSystem.start();
    }

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
    if (this.monitorSystem) {
      this.monitorSystem.stop();
      this.monitorSystem = null;
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
    if (this.executing) {
      console.log("[heartbeat] Previous task still running, skipping tick");
      return;
    }

    try {
      this.executing = true;
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

      if (dueTasks.length === 0) {
        // No due tasks — try idle task if enabled
        await this.maybeRunIdleTask();
        return;
      }

      console.log(`[heartbeat] ${dueTasks.length} task(s) due`);

      for (const task of dueTasks) {
        if (this.stopped) break;
        await this.executeTask(task);
      }
    } catch (err) {
      console.error("[heartbeat] Tick error:", err);
    } finally {
      this.executing = false;
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

      // Update last task execution time
      this.lastTaskExecutedAt = Date.now();

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

  /** Run an idle task if conditions are met */
  private async maybeRunIdleTask(): Promise<void> {
    if (!this.idleEnabled) return;

    const idleConfig = this.deps.config.idle;
    if (!idleConfig?.enabled) return;

    // Reset daily counter if date changed
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.idleTasksResetDate) {
      this.idleTasksToday = 0;
      this.idleTasksResetDate = today;
    }

    // Check daily idle task limit
    if (this.idleTasksToday >= idleConfig.maxIdleTasksPerDay) {
      return;
    }

    // Check idle threshold
    const elapsed = Date.now() - this.lastTaskExecutedAt;
    if (elapsed < idleConfig.idleThresholdMs) {
      return;
    }

    // Select and run idle strategy
    const { strategy, project } = selectIdleStrategy();
    const prompt = buildIdlePrompt(strategy, project, this.deps.goalStore);

    console.log(`[heartbeat] Running idle task: ${strategy.title} (${project})`);

    const idleTask: AgentTask = {
      id: crypto.randomUUID(),
      type: "one-time",
      status: "running",
      title: `[IDLE] ${strategy.title} - ${project}`,
      prompt,
      project,
      schedule_cron: null,
      schedule_next: null,
      event_trigger: null,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      max_runs: 1,
      notify_user: true,
      requires_approval: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { result, costUsd, durationMs } =
        await this.deps.executeTask(idleTask);

      this.lastTaskExecutedAt = Date.now();
      this.idleTasksToday++;

      // Audit
      await this.deps.audit.record({
        ts: new Date().toISOString(),
        type: "heartbeat",
        task: idleTask.title,
        violations: [],
        cost: costUsd,
        duration: durationMs,
      });

      // Notify
      if (result) {
        const targetChatId = this.getTargetChatId(idleTask);
        const prefix = `[IDLE/${project}] `;
        const message =
          result.length > 3800
            ? prefix + result.slice(0, 3800) + "..."
            : prefix + result;
        await this.deps.platform.sendMessage(targetChatId, message);
      }

      console.log(
        `[heartbeat] Idle task "${idleTask.title}" completed ($${costUsd?.toFixed(4) || "0"})`
      );
    } catch (err) {
      console.error(`[heartbeat] Idle task failed:`, err);
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

  /** Fire event-triggered tasks, optionally with context */
  async fireEvent(eventName: string, context?: string): Promise<void> {
    if (this.stopped) return;

    // Guard: don't fire during quiet hours
    if (this.isQuietHours()) {
      console.log(`[heartbeat] Event "${eventName}" suppressed (quiet hours)`);
      return;
    }

    const tasks = this.deps.taskStore.getEventTasks(eventName);
    for (const task of tasks) {
      // Append context to prompt if provided
      if (context) {
        const enrichedTask = { ...task, prompt: `${task.prompt}\n\nContext: ${context}` };
        await this.executeTask(enrichedTask);
      } else {
        await this.executeTask(task);
      }
    }
  }

  // ─── Feature Toggles ───

  setIdleEnabled(enabled: boolean): void {
    this.idleEnabled = enabled;
    console.log(`[heartbeat] Idle tasks ${enabled ? "enabled" : "disabled"}`);
  }

  setChainingEnabled(enabled: boolean): void {
    this.chainingEnabled = enabled;
    console.log(`[heartbeat] Task chaining ${enabled ? "enabled" : "disabled"}`);
  }

  setMonitorsEnabled(enabled: boolean): void {
    this.monitorsEnabled = enabled;
    if (enabled && !this.monitorSystem && this.deps.monitors && this.deps.monitors.length > 0) {
      this.monitorSystem = new MonitorSystem(
        this.deps.monitors,
        (eventName, context) => this.fireEvent(eventName, context)
      );
      this.monitorSystem.start();
    } else if (!enabled && this.monitorSystem) {
      this.monitorSystem.stop();
      this.monitorSystem = null;
    }
    console.log(`[heartbeat] Monitors ${enabled ? "enabled" : "disabled"}`);
  }

  getMonitorSystem(): MonitorSystem | null {
    return this.monitorSystem;
  }

  isChainingEnabled(): boolean {
    return this.chainingEnabled;
  }

  // ─── Status ───

  async getStatus(): Promise<{
    running: boolean;
    idleEnabled: boolean;
    chainingEnabled: boolean;
    monitorsEnabled: boolean;
    todayTaskCount: number;
    todayCost: number;
    lastTaskExecutedAt: number | null;
    monitorStatus: ReturnType<MonitorSystem["getStatus"]> | null;
  }> {
    const stats = await this.deps.audit.getTodayStats(this.deps.config.timezone);
    return {
      running: !this.stopped,
      idleEnabled: this.idleEnabled,
      chainingEnabled: this.chainingEnabled,
      monitorsEnabled: this.monitorsEnabled,
      todayTaskCount: stats.taskCount,
      todayCost: stats.totalCost,
      lastTaskExecutedAt: stats.lastTaskAt,
      monitorStatus: this.monitorSystem?.getStatus() ?? null,
    };
  }
}
