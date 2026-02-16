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

function timeAgo(ts: number | null): string {
  if (!ts) return "없음";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function elapsed(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 ${sec % 60}초`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

export function AgentControl({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState(false);
  const [, setTick] = useState(0);

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

  // Re-render every 5s to update elapsed time while tasks are running
  useEffect(() => {
    if (!status?.runningTasks?.length) return;
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, [status?.runningTasks?.length]);

  const toggle = async (feature: "idle" | "chain" | "monitors", enabled: boolean) => {
    try {
      await api.agentToggle(feature, enabled);
      fetchStatus();
    } catch { /* ignore */ }
  };

  const borderClass = pinned ? "border-primary/40" : "border-border";
  const isExecuting = (status?.runningTasks?.length ?? 0) > 0;

  // Monitor failures
  const monitors = status?.monitorStatus?.monitors || [];
  const totalFailures = monitors.reduce((sum, m) => sum + Object.keys(m.failures).length, 0);

  if (collapsed) {
    return (
      <div className={`bg-surface border ${borderClass} rounded-xl p-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isExecuting ? "bg-warning animate-pulse" : status?.running ? "bg-success" : error ? "bg-danger" : "bg-text-muted"}`} />
          <span className="text-sm font-medium">Agent</span>
          {status && (
            <span className="text-[10px] text-text-muted">
              {isExecuting
                ? `실행 중 ${status.runningTasks.length}건: ${status.runningTasks.map(t => t.project).join(", ")}`
                : `idle ${status.idleEnabled ? "on" : "off"} · tasks ${status.todayTaskCount}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onTogglePin} className={`p-1 rounded transition-colors ${pinned ? "text-primary" : "text-text-muted/40 hover:text-text-muted"}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" /></svg>
          </button>
          <button onClick={onToggleCollapse} className="p-1 text-text-muted/40 hover:text-text-muted rounded transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border ${borderClass} rounded-xl p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isExecuting ? "bg-warning animate-pulse" : status?.running ? "bg-success" : error ? "bg-danger" : "bg-text-muted"}`} />
          <h3 className="font-semibold text-sm">자율 에이전트</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onTogglePin} className={`p-1 rounded transition-colors ${pinned ? "text-primary" : "text-text-muted/40 hover:text-text-muted"}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" /></svg>
          </button>
          <button onClick={onToggleCollapse} className="p-1 text-text-muted/40 hover:text-text-muted rounded transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-danger">Agent API 연결 불가</p>
      ) : !status ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">상태</span>
            <span className={isExecuting ? "text-warning" : status.running ? "text-success" : "text-danger"}>
              {isExecuting ? `${status.runningTasks.length}건 실행 중` : status.running ? "대기 중" : "중지됨"}
            </span>
          </div>
          {status.runningTasks.length > 0 && (
            <div className="space-y-1.5">
              {status.runningTasks.map((task, i) => (
                <div key={i} className="bg-warning/10 border border-warning/20 rounded-lg p-2 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-warning font-medium">{task.title}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{task.project}</div>
                  </div>
                  <span className="text-[10px] text-text-muted tabular-nums">{elapsed(task.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">오늘 작업</span>
            <span>{status.todayTaskCount}건 · ${status.todayCost.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">마지막 작업</span>
            <span className="text-text-muted">{timeAgo(status.lastTaskExecutedAt)}</span>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <Toggle label="자율 탐색" enabled={status.idleEnabled} onChange={(v) => toggle("idle", v)} />
            <Toggle label="작업 연쇄" enabled={status.chainingEnabled} onChange={(v) => toggle("chain", v)} />
            <Toggle label="서비스 감시" enabled={status.monitorsEnabled} onChange={(v) => toggle("monitors", v)} />
          </div>

          {monitors.length > 0 && (
            <div className="text-xs text-text-muted">
              모니터 {monitors.length}개
              {totalFailures > 0 && <span className="text-warning"> · 장애 {totalFailures}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
