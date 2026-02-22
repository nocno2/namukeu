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

async function request<T>(path: string, options?: RequestInit & { params?: Record<string, number | string> }): Promise<T> {
  let url = `${BASE}${path}`;
  if (options?.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      searchParams.append(key, String(value));
    }
    url += `?${searchParams.toString()}`;
    delete options.params;
  }
  const res = await fetch(url, {
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

  // DCBOT channels
  dcbotChannels() {
    return request<{ channels: Array<{ channel_id: string; last_message_at: string | null }> }>("/api/dcbot/channels");
  },

  // DCBOT channel settings
  dcbotSettings() {
    return request<{ channels: Record<string, { engine: string }>; defaultEngine: string }>("/api/dcbot/settings");
  },
  dcbotChannelEngine(channelId: string) {
    return request<{ channelId: string; engine: string }>(`/api/dcbot/settings/${channelId}`);
  },
  setDcbotChannelEngine(channelId: string, engine: "claude" | "gemini") {
    return request<{ channelId: string; engine: string; ok: boolean }>(`/api/dcbot/settings/${channelId}`, {
      method: "POST",
      body: JSON.stringify({ engine }),
    });
  },
  setDcbotDefaultEngine(engine: "claude" | "gemini") {
    return request<{ engine: string; ok: boolean }>("/api/dcbot/settings/default", {
      method: "POST",
      body: JSON.stringify({ engine }),
    });
  },
  dcbotUsage() {
    return request<{
      claude: { costUsd: number; requests: number };
      gemini: { tokens: number; requests: number };
      lastUpdated: string;
    }>("/api/dcbot/usage");
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
  agentEngine() {
    return request<{ engine: string }>("/api/agent/engine");
  },
  setAgentEngine(engine: "claude" | "gemini") {
    return request<{ engine: string }>("/api/agent/engine", {
      method: "POST",
      body: JSON.stringify({ engine }),
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
  agentUpdateTask(taskId: string, updates: { title?: string; prompt?: string; project?: string; schedule_cron?: string; status?: string }) {
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
  agentDeleteTask(taskId: string) {
    return request<{ ok: boolean }>(`/api/agent/tasks/${taskId}`, {
      method: "DELETE",
    });
  },
  agentTaskHistory(taskId: string, limit: number = 10, offset: number = 0) {
    return request<{ history: TaskHistoryItem[] }>(`/api/agent/tasks/${taskId}/history`, {
      params: { limit, offset },
    });
  },
  agentCreateTask(task: {
    title: string;
    prompt: string;
    project: string;
    type: "one-time" | "recurring" | "event";
    schedule_cron?: string;
    schedule_at?: string;
    event_trigger?: string;
    requires_approval?: boolean;
    max_runs?: number;
  }) {
    return request<AgentTask>("/api/agent/tasks", {
      method: "POST",
      body: JSON.stringify(task),
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

  events(hours = 24, severity?: string, service?: string) {
    const params: Record<string, number | string> = { hours };
    if (severity) params.severity = severity;
    if (service) params.service = service;
    return request<{ events: DashboardEvent[]; hours: number }>("/api/events", { params });
  },

  n8nStatus() {
    return request<N8nStatus>("/api/n8n/status");
  },

  // 데이터 내보내기
  exportServiceData(name: string, format: "json" | "csv" = "json", dataType: "all" | "uptime" | "incidents" = "all", days = 30) {
    const params = new URLSearchParams();
    params.set("format", format);
    params.set("data_type", dataType);
    params.set("days", days.toString());
    window.open(`/api/services/${name}/export?${params.toString()}`, "_blank");
  },

  // 서비스 타입 조회/설정
  serviceType(name: string) {
    return request<{ service: string; type: string }>(`/api/services/${name}/type`);
  },

  setServiceType(name: string, type: "ktlo" | "evolving") {
    return request<{ service: string; type: string }>(`/api/services/${name}/type`, {
      method: "PUT",
      body: JSON.stringify({ type }),
    });
  },

  // COIN 백테스트 API (proxy through dashboard backend)
  coinBacktestResults(limit = 20) {
    return request<BacktestResult[]>(`/api/proxy/coin/api/backtest/results?limit=${limit}`);
  },

  coinBacktestValidate(resultId: number) {
    return request<BacktestValidation>(`/api/proxy/coin/api/backtest/results/${resultId}/validate`);
  },

  coinStartPaperTrading(resultId: number, exchange = "upbit") {
    return request<{ message: string; result_id: number; strategy_id: number; dry_run: boolean }>(
      `/api/proxy/coin/api/backtest/results/${resultId}/start-paper?exchange=${exchange}`,
      { method: "POST" },
    );
  },

  coinStartLiveTrading(resultId: number, exchange = "upbit") {
    return request<{ message: string; result_id: number; strategy_id: number; dry_run: boolean }>(
      `/api/proxy/coin/api/backtest/results/${resultId}/start-live?exchange=${exchange}`,
      { method: "POST" },
    );
  },

  // COIN 전환 준비 상태
  coinReadinessReport() {
    return request<ReadinessReport>("/api/proxy/coin/api/readiness-report");
  },

  // COIN 트레이딩 모드
  coinTradingMode() {
    return request<TradingMode>("/api/proxy/coin/api/trading-mode");
  },

  // COIN dry-run 토글
  coinToggleDryRun(dryRun: boolean | null, exchange?: string) {
    const params = new URLSearchParams();
    if (dryRun !== null) params.set("dry_run", dryRun.toString());
    if (exchange) params.set("exchange", exchange);
    return request<{ success: boolean; mode: string; effective_dry_run: boolean }>(
      `/api/proxy/coin/api/toggle-dry-run?${params.toString()}`,
      { method: "POST" },
    );
  },

  // COIN PnL (수익률)
  coinPnL(initialCapital = 1000000) {
    return request<CoinPnLData>(`/api/proxy/coin/api/trading/paper-pnl?initial_capital=${initialCapital}`);
  },

  // COIN 통계
  coinStats() {
    return request<CoinStatsData>("/api/proxy/coin/api/trading/paper-stats");
  },
};

export interface BacktestResult {
  id: number;
  strategy_name: string;
  ticker: string;
  interval: string;
  params: Record<string, unknown>;
  total_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  profit_factor: number;
  final_capital: number;
  created_at: string;
}

export interface BacktestValidation {
  result_id: number;
  strategy_name: string;
  ticker: string;
  interval: string;
  params: Record<string, unknown>;
  backtest_metrics: {
    total_return_pct: number;
    win_rate: number;
    max_drawdown_pct: number;
    total_trades: number;
  };
  checklist: {
    min_return_pct: number;
    min_win_rate_pct: number;
    max_drawdown_pct: number;
    min_trades: number;
  };
  eligibility: {
    can_live_trade: boolean;
    can_paper_trade: boolean;
    reasons: string[];
  };
}

export interface ServiceStatus {
  name: string;
  display_name: string;
  description: string;
  type: string;
  port: number | null;
  status: "running" | "down";
  latency_ms: number | null;
  details: Record<string, unknown> | null;
  dashboard_url: string | null;
  checked_at: string;
  service_type?: string;
  launchd_label?: string | null;
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
  monthly_target?: number;
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

export interface TaskHistoryItem {
  id: number;
  task_id: string;
  prompt: string | null;
  result: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  cost: number | null;
  tokens: number | null;
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

export interface DashboardEvent {
  id: number;
  type: string;
  service_name: string;
  message: string;
  severity: "critical" | "warning" | "info" | "success";
  timestamp: string;
  notified: number;
}

export interface N8nStatus {
  status: "running" | "down";
  active_workflows: number;
  today_executions: number;
  success_count: number;
  fail_count: number;
  last_execution: string | null;
}

export interface ReadinessReport {
  backtest: {
    total: number;
    profitable: number;
    profitable_rate: number;
  };
  paper_trading: {
    initial_capital: number;
    final_capital: number;
    total_pnl: number;
    total_pnl_pct: number;
    completed_trades: number;
    win_rate: number;
  };
  drawdown: {
    current_max: number;
    valid: boolean;
    threshold: number;
  };
  ready_for_live: boolean;
}

export interface TradingMode {
  global: {
    config: boolean;
    runtime_override: boolean | null;
    effective: boolean;
  };
  exchanges: Record<string, {
    config: boolean;
    runtime_override: boolean | null;
    per_exchange: boolean | null;
    effective: boolean;
  }>;
}

export interface CoinPnLData {
  initial_capital: number;
  final_capital: number;
  total_pnl: number;
  total_pnl_pct: number;
  completed_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  max_drawdown_pct: number;
  trades: Array<{
    ticker: string;
    side: string;
    entry_price: number;
    exit_price: number;
    volume: number;
    pnl: number;
    pnl_pct: number;
    entry_time: string;
    exit_time: string;
  }>;
}

export interface CoinStatsData {
  completed_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  total_pnl_pct: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  max_drawdown_pct: number;
}
