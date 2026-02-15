import { useCallback, useEffect, useState } from "react";
import { api, type AgentStatus } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

function Toggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-muted">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${enabled ? "bg-primary" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function AgentControl({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.agentStatus();
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const toggle = async (feature: "idle" | "chain" | "monitors", enabled: boolean) => {
    try {
      await api.agentToggle(feature, enabled);
      fetchStatus();
    } catch { /* ignore */ }
  };

  const borderClass = pinned ? "border-primary/40" : "border-border";

  if (collapsed) {
    return (
      <div className={`bg-surface border ${borderClass} rounded-xl p-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status?.running ? "bg-success" : error ? "bg-danger" : "bg-text-muted"}`} />
          <span className="text-sm font-medium">Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onTogglePin} className="text-text-muted hover:text-text text-xs cursor-pointer">{pinned ? "\u{1F4CC}" : "\u{1F4CD}"}</button>
          <button onClick={onToggleCollapse} className="text-text-muted hover:text-text text-xs cursor-pointer">+</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border ${borderClass} rounded-xl p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status?.running ? "bg-success" : error ? "bg-danger" : "bg-text-muted"}`} />
          <h3 className="font-medium">Agent Control</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onTogglePin} className="text-text-muted hover:text-text text-xs cursor-pointer">{pinned ? "\u{1F4CC}" : "\u{1F4CD}"}</button>
          <button onClick={onToggleCollapse} className="text-text-muted hover:text-text text-xs cursor-pointer">{"\u2212"}</button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-danger">Agent API unavailable</p>
      ) : !status ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Status</span>
            <span className={status.running ? "text-success" : "text-danger"}>{status.running ? "Running" : "Stopped"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Uptime</span>
            <span>{formatUptime(status.uptime)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Today</span>
            <span>{status.today.taskCount} tasks / ${status.today.costUsd.toFixed(2)}</span>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            {status.idle && <Toggle label="Idle Exploration" enabled={status.idle.enabled} onChange={(v) => toggle("idle", v)} />}
            {status.chain && <Toggle label="Task Chaining" enabled={status.chain.enabled} onChange={(v) => toggle("chain", v)} />}
            {status.monitors && <Toggle label="Monitors" enabled={status.monitors.enabled} onChange={(v) => toggle("monitors", v)} />}
          </div>

          {status.monitors && (
            <div className="text-xs text-text-muted">
              Health: {status.monitors.healthy}/{status.monitors.total} services
            </div>
          )}

          {status.tasks.nextTitle && (
            <div className="text-xs text-text-muted">
              Next: {status.tasks.nextTitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
