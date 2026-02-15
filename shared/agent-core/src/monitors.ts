import type { MonitorDefinition, MonitorState } from "./types";

export class MonitorSystem {
  private monitors: MonitorDefinition[];
  private state: MonitorState;
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private fireEvent: (eventName: string, context?: string) => Promise<void>;

  constructor(
    monitors: MonitorDefinition[],
    fireEvent: (eventName: string, context?: string) => Promise<void>
  ) {
    this.monitors = monitors;
    this.fireEvent = fireEvent;
    this.state = { failureCounts: {}, lastCheckAt: null, firedEvents: {} };
  }

  start(): void {
    for (const monitor of this.monitors) {
      if (!monitor.enabled) continue;

      // Run first check after 10 seconds
      setTimeout(() => this.checkMonitor(monitor), 10_000);

      const timer = setInterval(() => this.checkMonitor(monitor), monitor.intervalMs);
      this.timers.set(monitor.id, timer);
      console.log(`[monitor] Started: ${monitor.name} (every ${monitor.intervalMs / 1000}s)`);
    }
  }

  stop(): void {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    console.log("[monitor] All monitors stopped");
  }

  private async checkMonitor(monitor: MonitorDefinition): Promise<void> {
    if (monitor.config.type === "health_check") {
      await this.checkHealthEndpoints(monitor);
    }
    this.state.lastCheckAt = new Date().toISOString();
  }

  private async checkHealthEndpoints(monitor: MonitorDefinition): Promise<void> {
    const config = monitor.config;

    for (const endpoint of config.endpoints) {
      const key = `${monitor.id}:${endpoint.name}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs || 5000);

        const resp = await fetch(endpoint.url, { signal: controller.signal });
        clearTimeout(timeout);

        if (resp.ok) {
          // Service recovered
          const wasFired = this.state.firedEvents[key];
          this.state.failureCounts[key] = 0;

          if (wasFired) {
            delete this.state.firedEvents[key];
            console.log(`[monitor] ${endpoint.name} recovered`);
            await this.fireEvent("server_recovered", `${endpoint.name} 서비스가 복구되었습니다.`);
          }
        } else {
          this.state.failureCounts[key] = (this.state.failureCounts[key] || 0) + 1;
        }
      } catch {
        this.state.failureCounts[key] = (this.state.failureCounts[key] || 0) + 1;
      }

      // Check threshold
      const failures = this.state.failureCounts[key] || 0;
      if (failures >= config.failureThreshold && !this.state.firedEvents[key]) {
        this.state.firedEvents[key] = new Date().toISOString();
        console.log(`[monitor] ${endpoint.name} DOWN (${failures} consecutive failures)`);
        await this.fireEvent(
          monitor.eventName,
          `${endpoint.name} 서비스가 ${failures}회 연속 응답 실패했습니다.\nURL: ${endpoint.url}\nProject: ${endpoint.project || "UNKNOWN"}`
        );
      }
    }
  }

  setEnabled(monitorId: string, enabled: boolean): void {
    const monitor = this.monitors.find((m) => m.id === monitorId);
    if (!monitor) return;
    monitor.enabled = enabled;

    if (!enabled) {
      const timer = this.timers.get(monitorId);
      if (timer) { clearInterval(timer); this.timers.delete(monitorId); }
    } else if (!this.timers.has(monitorId)) {
      const timer = setInterval(() => this.checkMonitor(monitor), monitor.intervalMs);
      this.timers.set(monitorId, timer);
    }
  }

  getStatus(): { monitors: Array<{ id: string; name: string; enabled: boolean; lastCheck: string | null; failures: Record<string, number> }> } {
    return {
      monitors: this.monitors.map((m) => {
        const failures: Record<string, number> = {};
        for (const ep of m.config.endpoints) {
          const key = `${m.id}:${ep.name}`;
          const count = this.state.failureCounts[key] || 0;
          if (count > 0) failures[ep.name] = count;
        }
        return { id: m.id, name: m.name, enabled: m.enabled, lastCheck: this.state.lastCheckAt, failures };
      }),
    };
  }

  isAllHealthy(): boolean {
    return this.monitors.every((m) =>
      m.config.endpoints.every((ep) => (this.state.failureCounts[`${m.id}:${ep.name}`] || 0) === 0)
    );
  }

  getHealthyCount(): { healthy: number; total: number } {
    let healthy = 0;
    let total = 0;
    for (const m of this.monitors) {
      for (const ep of m.config.endpoints) {
        total++;
        if ((this.state.failureCounts[`${m.id}:${ep.name}`] || 0) === 0) healthy++;
      }
    }
    return { healthy, total };
  }
}
