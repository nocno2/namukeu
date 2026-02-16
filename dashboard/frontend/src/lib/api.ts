const BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`${res.status}`);
  }
  return res.json();
}

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

  scheduledTasks() {
    return request<{ tasks: ScheduledTask[] }>("/api/system/launchagents");
  },

  agentStatus() {
    return request<AgentStatus>("/api/agent/status");
  },
  agentToggle(feature: "idle" | "chain" | "monitors", enabled: boolean) {
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

  agentTasks(activeOnly = true) {
    return request<AgentTask[]>(`/api/agent/tasks?active_only=${activeOnly}`);
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
  display_name: string;
  description: string;
  schedule: string;
  last_run: string | null;
}

export interface AgentStatus {
  running: boolean;
  runningTasks: { title: string; project: string; startedAt: number }[];
  idleEnabled: boolean;
  chainingEnabled: boolean;
  monitorsEnabled: boolean;
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
  status: "active" | "completed" | "paused";
  priority: "high" | "medium" | "low";
  deadline: string | null;
  progress: string | null;
  created_at: string;
  updated_at: string;
}
