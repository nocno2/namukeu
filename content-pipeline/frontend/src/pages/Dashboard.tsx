import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Task, HistoryEntry, PipelineRun, HistoryStats, Draft } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";

export function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    api.getTasks().then((d) => setTasks(d.tasks)).catch(() => {});
    api.getRecentHistory(10).then((d) => setHistory(d.history)).catch(() => {});
    api.getHistoryStats().then(setStats).catch(() => {});
    api.getPipelineRuns(5).then((d) => setRuns(d.runs)).catch(() => {});
    api.getDrafts("reviewed").then((d) => setDrafts(d.drafts)).catch(() => {});
  }, []);

  const activeTasks = tasks.filter((t) => t.enabled);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Tasks" value={activeTasks.length} />
        <StatCard label="Total Runs" value={stats?.total ?? 0} />
        <StatCard label="Success Rate" value={`${stats?.success_rate ?? 0}%`} />
        <StatCard label="Pending Review" value={drafts.length} />
      </div>

      {/* Recent Pipeline Runs */}
      <section className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-muted mb-3">Recent Pipeline Runs</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-text-muted">No pipeline runs yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <span className="text-sm">{run.selected_keyword || "—"}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  {run.seo_score != null && <span>SEO: {run.seo_score}</span>}
                  <span>{new Date(run.started_at).toLocaleString("ko-KR")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Execution History */}
      <section className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-muted mb-3">Recent Executions</h3>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">No executions yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <StatusBadge status={h.status} />
                  <span className="text-sm">{h.task_name || h.task_id}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  {h.duration_ms != null && <span>{(h.duration_ms / 1000).toFixed(1)}s</span>}
                  <span>{new Date(h.started_at).toLocaleString("ko-KR")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
