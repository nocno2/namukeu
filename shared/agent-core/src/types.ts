// ─── Platform Adapter ───

export type AgentEngine = "claude" | "gemini";

export interface AgentRunnerOptions {
  engine: AgentEngine;
  sessionId: string;
  isNewSession: boolean;
  systemPrompt?: string;
  cwd?: string;
  onProgress?: (message: string) => void;
}

export interface AgentRunnerResult {
  success: boolean;
  result: string;
  sessionId: string;
  error?: string;
  costUsd?: number;    // Claude only
  tokens?: number;     // Gemini only (total_tokens)
  durationMs?: number;
}

export interface PlatformAdapter {
  name: "telegram" | "discord";
  maxMessageLength: number;
  sendMessage(chatId: string, text: string): Promise<void>;
  sendTyping(chatId: string): Promise<() => void>;
}

// ─── Claude CLI ───

export interface ClaudeOptions {
  sessionId: string;
  isNewSession: boolean;
  systemPrompt?: string;
  cwd?: string;
  onProgress?: (message: string) => void;
}

export interface ClaudeResult {
  success: boolean;
  result: string;
  sessionId: string;
  error?: string;
  costUsd?: number;
  durationMs?: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  name: string;
  input: Record<string, any>;
}

// ─── Tasks ───

export type TaskType = "one-time" | "recurring" | "event";
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "paused";

export type ProjectCode = "COIN" | "BLOG" | "DASH" | "TRAIN" | "TGBOT" | "DCBOT" | "GENERAL";

export interface AgentTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  prompt: string;
  project: ProjectCode;
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
  chain_depth?: number;
  chain_parent_id?: string;
}

/** Maps project codes to platform-specific channel/chat IDs */
export type ChannelMap = Partial<Record<ProjectCode, string>>;

// ─── Forbidden Actions ───

export type ForbiddenSeverity = "critical" | "warning";

export interface ForbiddenRule {
  id: string;
  description: string;
  pattern?: string;
  type?: "command" | "cost_limit" | "rate_limit";
  severity: ForbiddenSeverity;
  max_cost_usd?: number;
  max_per_hour?: number;
}

export interface ForbiddenConfig {
  version: number;
  rules: ForbiddenRule[];
  updated_at: string;
}

export interface Violation {
  rule: ForbiddenRule;
  detail: string;
  timestamp: string;
}

// ─── Audit ───

export interface AuditEntry {
  ts: string;
  type: "heartbeat" | "reactive" | "system";
  task?: string;
  chatId?: string;
  violations: Violation[];
  cost?: number;
  duration?: number;
}

// ─── Heartbeat ───

export interface HeartbeatConfig {
  intervalMs: number;
  dailyBudgetUsd: number;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number;   // 0-23
  maxProactivePerHour: number;
  timezone: string;
  idle: IdleConfig;
  monitorsEnabled: boolean;
  chainingEnabled: boolean;
}

// ─── Monitors ───

export interface HealthCheckEndpoint {
  name: string;
  url: string;
  timeoutMs?: number;
  project?: ProjectCode;
}

export interface HealthCheckMonitorConfig {
  type: "health_check";
  endpoints: HealthCheckEndpoint[];
  failureThreshold: number;
}

export interface MonitorDefinition {
  id: string;
  name: string;
  eventName: string;
  intervalMs: number;
  enabled: boolean;
  config: HealthCheckMonitorConfig;
}

export interface MonitorState {
  failureCounts: Record<string, number>;
  lastCheckAt: string | null;
  firedEvents: Record<string, string>;
}

// ─── Idle ───

export interface IdleConfig {
  enabled: boolean;
  idleThresholdMs: number;
  maxIdleTasksPerDay: number;
}

// ─── Goals ───

export interface Goal {
  id: string;
  title: string;
  description: string;
  projects: ProjectCode[];
  status: "active" | "completed" | "paused";
  priority: "high" | "medium" | "low";
  deadline: string | null;
  progress: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Tag Process Context ───

export interface TagProcessContext {
  chainDepth?: number;
  parentTaskId?: string;
  maxChainDepth?: number;
}
