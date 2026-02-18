const BASE = "";

class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // response body not JSON, use status text
      if (res.statusText) detail = `${res.status} ${res.statusText}`;
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export { ApiError };

export const api = {
  login(username: string, password: string) {
    return request<{ ok: boolean; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  logout() {
    return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },

  me() {
    return request<{ username: string }>("/api/auth/me");
  },

  services() {
    return request<{ services: ServiceStatus[] }>("/api/services");
  },

  commits(name: string, limit = 10) {
    return request<{ service: string; commits: Commit[] }>(
      `/api/services/${name}/commits?limit=${limit}`,
    );
  },

  restart(name: string) {
    return request<{ ok: boolean; service: string }>(
      `/api/services/${name}/restart`,
      { method: "POST" },
    );
  },

  claudeUsage() {
    return request<ClaudeUsage>("/api/claude/usage");
  },

  minimaxUsage() {
    return request<MiniMaxUsage>("/api/minimax/usage");
  },

  claudeModel() {
    return request<{ model: string; display: string }>("/api/claude/model");
  },

  setClaudeModel(model: "claude" | "minimax") {
    return request<{ ok: boolean; model: string }>("/api/claude/model", {
      method: "POST",
      body: JSON.stringify({ model }),
    });
  },

  cardPreferences() {
    return request<{ preferences: Record<string, CardPreference> }>("/api/cards/preferences");
  },

  updateCardPreference(cardId: string, update: Partial<Pick<CardPreference, "collapsed" | "pinned" | "pin_order">>) {
    return request<{ ok: boolean }>("/api/cards/preferences", {
      method: "PUT",
      body: JSON.stringify({ card_id: cardId, ...update }),
    });
  },

  systemResources() {
    return request<SystemResources>("/api/system/resources");
  },

  serviceLogs(name: string, lines = 50) {
    return request<{ service: string; lines: string[]; total_size: number }>(
      `/api/services/${name}/logs?lines=${lines}`,
    );
  },

  blogTraffic() {
    return request<BlogTraffic>("/api/blog/traffic");
  },

  trainSummary() {
    return request<TrainSummary>("/api/train/summary");
  },

  cancelTrainReservation(reservationId: number) {
    return request<{ message: string }>(`/api/train/reservations/${reservationId}`, {
      method: "DELETE",
    });
  },

  scheduledTasks() {
    return request<{ tasks: ScheduledTask[] }>("/api/system/launchagents");
  },

  toggleScheduledTask(taskId: string, enabled: boolean) {
    return request<{ ok: boolean; enabled: boolean }>(
      `/api/system/launchagents/${encodeURIComponent(taskId)}/toggle`,
      {
        method: "POST",
        body: JSON.stringify({ enabled }),
      },
    );
  },

  agentStatus() {
    return request<AgentStatus>("/api/agent/status");
  },
  agentToggle(feature: "idle" | "chain" | "monitors" | "evolution", enabled: boolean) {
    return request<{ ok: boolean }>(`/api/agent/toggle/${feature}`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
  },
  agentGoals() {
    return request<AgentGoal[]>("/api/agent/goals");
  },
  agentCreateGoal(goal: { title: string; description: string; projects: string[]; priority?: string; deadline?: string }) {
    return request<AgentGoal>("/api/agent/goals", {
      method: "POST",
      body: JSON.stringify(goal),
    });
  },
  agentUpdateGoal(id: string, updates: Partial<AgentGoal>) {
    return request<AgentGoal>(`/api/agent/goals/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  },
  agentDeleteGoal(id: string) {
    return request<{ ok: boolean }>(`/api/agent/goals/${id}`, {
      method: "DELETE",
    });
  },
  agentApproveGoal(id: string) {
    return request<AgentGoal>(`/api/agent/goals/${id}/approve`, {
      method: "POST",
    });
  },

  agentTasks(activeOnly = true) {
    return request<AgentTask[]>(`/api/agent/tasks?active_only=${activeOnly}`);
  },
  agentUpdateTask(taskId: string, updates: { title?: string; prompt?: string; project?: string; schedule_cron?: string }) {
    return request<AgentTask>(`/api/agent/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  },
  agentApproveTask(taskId: string) {
    return request<{ ok: boolean }>(`/api/agent/tasks/${taskId}/approve`, {
      method: "POST",
    });
  },
  agentCancelTask(taskId: string) {
    return request<{ ok: boolean }>(`/api/agent/tasks/${taskId}/cancel`, {
      method: "POST",
    });
  },
  agentApproveAllTasks() {
    return request<{ ok: boolean; count: number }>("/api/agent/tasks/approve-all", {
      method: "POST",
    });
  },

  serviceUptime(name: string, hours = 24) {
    return request<ServiceUptime>(
      `/api/services/${name}/uptime?hours=${hours}`,
    );
  },

  serviceIncidents(name: string, days = 30) {
    return request<{ service: string; days: number; incidents: Incident[] }>(
      `/api/services/${name}/incidents?days=${days}`,
    );
  },

  n8nStatus() {
    return request<N8nStatus>("/api/n8n/status");
  },
};

export interface ServiceStatus {
  name: string;
  display_name: string;
  description: string;
  type: string;
  port: number | null;
  status: "running" | "down";
  details: Record<string, unknown> | null;
  dashboard_url: string | null;
  checked_at: string;
}

export interface Commit {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
}

export interface ClaudeUsageItem {
  utilization: number;
  resets_at: string;
}

export interface ClaudeUsage {
  five_hour: ClaudeUsageItem | null;
  seven_day: ClaudeUsageItem | null;
  [key: string]: unknown;
}

export interface MiniMaxUsage {
  model_remains: MiniMaxModelRemain[];
  base_resp: { status_code: number; status_msg: string };
}

export interface MiniMaxModelRemain {
  start_time: number;
  end_time: number;
  remains_time: number;
  current_interval_total_count: number;
  current_interval_usage_count: number;
  model_name: string;
}

export interface CardPreference {
  card_id: string;
  collapsed: number | boolean;
  pinned: number | boolean;
  pin_order: number;
}

export interface SystemResources {
  cpu_percent: number;
  memory: { total_gb: number; used_gb: number; percent: number };
  disk: { total_gb: number; used_gb: number; percent: number };
}

export interface BlogTraffic {
  today_views: number;
  total_views: number;
  top_posts: { slug: string; title: string; views: number }[];
  daily_trend: { date: string; views: number }[];
}

export interface TrainSummary {
  active_macros: number;
  active_reservations: TrainReservation[];
  total_reservations: number;
  by_status: Record<string, number>;
  recent_reservations: TrainReservation[];
}

export interface TrainReservation {
  id?: number;
  provider?: string;
  dep_station?: string;
  arr_station?: string;
  date?: string;
  time_range_start?: string;
  time_range_end?: string;
  seat_type?: string;
  status?: string;
  train_info?: string | null;
  created_at?: string;
  reserved_at?: string | null;
  [key: string]: unknown;
}

export interface ScheduledTask {
  id: string;
  display_name: string;
  description: string;
  schedule: string;
  last_run: string | null;
  enabled: boolean;
}

export interface AgentStatus {
  running: boolean;
  runningTasks: { title: string; project: string; startedAt: number }[];
  idleEnabled: boolean;
  chainingEnabled: boolean;
  monitorsEnabled: boolean;
  evolutionEnabled: boolean;
  todayTaskCount: number;
  todayCost: number;
  lastTaskExecutedAt: number | null;
  monitorStatus: {
    monitors: { id: string; name: string; enabled: boolean; lastCheck: string | null; failures: Record<string, number> }[];
  } | null;
}

export interface UptimeBlock {
  status: "running" | "down" | "no_data";
  start: string;
}

export interface ServiceUptime {
  service: string;
  hours: number;
  blocks: UptimeBlock[];
  uptime_percent: number | null;
}

export interface Incident {
  id: number;
  service_name: string;
  started_at: string;
  resolved_at: string | null;
  duration_sec: number | null;
  auto_recovered: number;
  recovery_attempt_count: number;
}

export interface AgentTask {
  id: string;
  type: "one-time" | "recurring" | "event";
  status: "pending" | "running" | "completed" | "failed" | "paused";
  title: string;
  prompt: string;
  project: string;
  schedule_cron: string | null;
  schedule_next: string | null;
  event_trigger: string | null;
  last_run_at: string | null;
  last_result: string | null;
  run_count: number;
  max_runs: number | null;
  notify_user: boolean;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentGoal {
  id: string;
  title: string;
  description: string;
  projects: string[];
  status: "active" | "completed" | "paused" | "proposed";
  priority: "high" | "medium" | "low";
  deadline: string | null;
  progress: string | null;
  source?: "user" | "evolution";
  created_at: string;
  updated_at: string;
}

export interface N8nStatus {
  status: "running" | "down";
  active_workflows: number;
  today_executions: number;
  success_count: number;
  fail_count: number;
  last_execution: string | null;
}
