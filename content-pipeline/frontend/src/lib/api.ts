const BASE = "";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Auth
export const api = {
  login: (username: string, password: string) =>
    request<{ ok: boolean; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/api/auth/me"),

  // Tasks
  getTasks: () => request<{ tasks: Task[] }>("/api/tasks"),
  createTask: (data: TaskCreate) =>
    request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: string, data: Partial<TaskCreate>) =>
    request<Task>(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  runTask: (id: string) =>
    request<{ ok: boolean; history_id: number }>(`/api/tasks/${id}/run`, { method: "POST" }),
  getTaskHistory: (id: string, limit = 20) =>
    request<{ history: HistoryEntry[] }>(`/api/tasks/${id}/history?limit=${limit}`),

  // History
  getRecentHistory: (limit = 50) =>
    request<{ history: HistoryEntry[] }>(`/api/history?limit=${limit}`),
  getHistoryStats: () => request<HistoryStats>("/api/history/stats"),

  // Pipeline
  getPipelineRuns: (limit = 20) =>
    request<{ runs: PipelineRun[] }>(`/api/pipeline/runs?limit=${limit}`),
  triggerPipeline: (keyword?: string) =>
    request<{ run_id: string; status: string }>("/api/pipeline/run", {
      method: "POST",
      body: JSON.stringify({ keyword }),
    }),
  getPipelineRun: (id: string) => request<PipelineRun>(`/api/pipeline/runs/${id}`),
  getKeywords: () => request<{ keywords: Keyword[] }>("/api/pipeline/keywords"),

  // Drafts
  getDrafts: (status?: string) =>
    request<{ drafts: Draft[] }>(`/api/pipeline/drafts${status ? `?status=${status}` : ""}`),
  getDraft: (id: number) => request<Draft>(`/api/pipeline/drafts/${id}`),
  updateDraft: (id: number, data: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/pipeline/drafts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  reviewDraft: (id: number) =>
    request<{ seo: SeoScore; readability: ReadabilityScore }>(
      `/api/pipeline/drafts/${id}/review`,
      { method: "POST" },
    ),
  approveDraft: (id: number) =>
    request<{ ok: boolean }>(`/api/pipeline/drafts/${id}/approve`, { method: "POST" }),
  rejectDraft: (id: number, reason: string) =>
    request<{ ok: boolean }>(`/api/pipeline/drafts/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

// Types
export interface Task {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  handler: string;
  config: string | null;
  cron_expr: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  name: string;
  description?: string;
  task_type: string;
  handler: string;
  config?: Record<string, unknown>;
  cron_expr?: string;
  enabled?: boolean;
}

export interface HistoryEntry {
  id: number;
  task_id: string;
  task_name?: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  result: string | null;
  error: string | null;
}

export interface HistoryStats {
  total: number;
  success: number;
  failed: number;
  success_rate: number;
  avg_duration_ms: number;
}

export interface PipelineRun {
  id: string;
  status: string;
  keywords: string | null;
  selected_keyword: string | null;
  blog_draft_id: number | null;
  seo_score: number | null;
  readability_score: number | null;
  review_notes: string | null;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface Keyword {
  keyword: string;
  source: string;
  score?: number;
}

export interface Draft {
  id: number;
  keyword: string;
  topic: string;
  outline: string | null;
  source: string;
  title: string | null;
  slug: string | null;
  content: string | null;
  excerpt: string | null;
  tags: string | null;
  reviewFeedback: string | null;
  reviewScore: number | null;
  revisedContent: string | null;
  rejectReason: string | null;
  pipelineId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeoScore {
  score: number;
  checks: Record<string, boolean>;
  word_count: number;
  heading_count: number;
  keyword_density: number;
}

export interface ReadabilityScore {
  score: number;
  sentence_count: number;
  avg_sentence_length: number;
  paragraph_count: number;
  avg_paragraph_length: number;
}
