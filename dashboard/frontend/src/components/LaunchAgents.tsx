import { useCallback, useEffect, useState } from "react";
import { api, type LaunchAgent } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

export function LaunchAgents({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [agents, setAgents] = useState<LaunchAgent[]>([]);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.launchAgents();
      setAgents(data.agents);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (error || agents.length === 0) return null;

  const activeCount = agents.filter((a) => a.pid !== null).length;

  return (
    <div className={`bg-surface border rounded-xl ${pinned ? "border-primary/40" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Scheduled Tasks</h3>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onTogglePin} className={`p-1 rounded transition-colors ${pinned ? "text-primary" : "text-text-muted/40 hover:text-text-muted"}`} title={pinned ? "고정 해제" : "상단 고정"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" /></svg>
          </button>
          <button onClick={onToggleCollapse} className="p-1 text-text-muted/40 hover:text-text-muted rounded transition-colors" title={collapsed ? "펼치기" : "접기"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {collapsed ? <polyline points="6 9 12 15 18 9" /> : <polyline points="6 15 12 9 18 15" />}
            </svg>
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
          <span className="font-mono">{activeCount}/{agents.length}</span>
          <span className="text-text-muted">active</span>
        </div>
      ) : (
        <div className="mt-4 space-y-1.5">
          {agents.map((a) => {
            const isActive = a.pid !== null;
            const hasError = a.last_exit !== null && a.last_exit !== 0;
            return (
              <div key={a.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-success" : hasError ? "bg-danger" : "bg-text-muted/30"}`} />
                  <span className="text-text-muted">{a.display_name}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  {a.pid && <span className="text-text-muted">PID {a.pid}</span>}
                  {hasError && (
                    <span className="text-danger">exit {a.last_exit}</span>
                  )}
                  {!isActive && !hasError && (
                    <span className="text-text-muted/40">stopped</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
