import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { HistoryEntry } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";

export function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(() => {
    api.getRecentHistory(100).then((d) => setHistory(d.history)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const filtered = filter
    ? history.filter((h) => h.status === filter)
    : history;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Execution History</h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
          <button
            onClick={load}
            className="text-sm text-primary hover:text-primary-hover cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-text-muted p-5">No execution history.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr
                  key={h.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                >
                  <td className="px-4 py-3">{h.task_name || h.task_id}</td>
                  <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(h.started_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {h.duration_ms != null ? `${(h.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Expanded Detail */}
      {expandedId && (() => {
        const entry = history.find((h) => h.id === expandedId);
        if (!entry) return null;
        return (
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-2">Execution Detail</h3>
            {entry.result && (
              <div className="mb-3">
                <p className="text-xs text-text-muted mb-1">Result:</p>
                <pre className="text-xs bg-bg p-3 rounded-lg overflow-x-auto">{entry.result}</pre>
              </div>
            )}
            {entry.error && (
              <div>
                <p className="text-xs text-danger mb-1">Error:</p>
                <pre className="text-xs bg-bg p-3 rounded-lg overflow-x-auto text-danger">{entry.error}</pre>
              </div>
            )}
            {!entry.result && !entry.error && (
              <p className="text-xs text-text-muted">No additional details.</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
