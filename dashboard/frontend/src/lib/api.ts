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

  launchAgents() {
    return request<{ agents: LaunchAgent[] }>("/api/system/launchagents");
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
  created_at?: string;
  [key: string]: unknown;
}

export interface LaunchAgent {
  label: string;
  display_name: string;
  status: string;
  pid: number | null;
  last_exit: number | null;
}
