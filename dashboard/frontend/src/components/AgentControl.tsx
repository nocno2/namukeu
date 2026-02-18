import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Eye,
  Pin,
  PinOff,
  Play,
  Rocket,
  Workflow,
} from "lucide-react";
import { api, type AgentStatus } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

function Toggle({ label, enabled, onChange, icon }: { label: string; enabled: boolean; onChange: (v: boolean) => void; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-muted flex items-center gap-2">
        {icon}
        {label}
      </span>
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

  const toggle = async (feature: "idle" | "chain" | "monitors" | "evolution", enabled: boolean) => {
    try {
      await api.agentToggle(feature, enabled);
      fetchStatus();
    } catch { /* ignore */ }
  };

  const borderClass = pinned ? "border-primary/50" : "border-border/60";
  const isExecuting = (status?.runningTasks?.length ?? 0) > 0;

  // Monitor failures
  const monitors = status?.monitorStatus?.monitors || [];
  const totalFailures = monitors.reduce((sum, m) => sum + Object.keys(m.failures).length, 0);

  if (collapsed) {
    return (
      <div className={`bg-surface border ${borderClass} rounded-2xl p-3 flex items-center justify-between card-glow card-transition`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isExecuting ? "bg-warning animate-pulse" : status?.running ? "bg-success" : error ? "bg-danger" : "bg-text-muted"}`} />
          <Bot size={14} className="text-primary" />
          <span className="text-sm font-medium text-text">Agent</span>
          {status && (
            <span className="text-[10px] text-text-muted">
              {isExecuting
                ? `실행 중 ${status.runningTasks.length}건: ${status.runningTasks.map(t => t.project).join(", ")}`
                : `idle ${status.idleEnabled ? "on" : "off"} · tasks ${status.todayTaskCount}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
            }`}
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border ${borderClass} rounded-2xl p-5 card-glow card-transition`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">자율 에이전트</h3>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
            }`}
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
          >
            <ChevronUp size={14} />
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
                <div key={i} className="bg-warning/10 border border-warning/20 rounded-xl p-2.5 flex items-center justify-between">
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
            <span className="text-text">{status.todayTaskCount}건 · ${status.todayCost.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">마지막 작업</span>
            <span className="text-text-muted">{timeAgo(status.lastTaskExecutedAt)}</span>
          </div>

          <div className="border-t border-border/60 pt-3 space-y-3">
            <Toggle label="서비스 진화" enabled={status.evolutionEnabled} onChange={(v) => toggle("evolution", v)} icon={<Rocket size={14} />} />
            <Toggle label="자율 탐색" enabled={status.idleEnabled} onChange={(v) => toggle("idle", v)} icon={<Play size={14} />} />
            <Toggle label="작업 연쇄" enabled={status.chainingEnabled} onChange={(v) => toggle("chain", v)} icon={<Workflow size={14} />} />
            <Toggle label="서비스 감시" enabled={status.monitorsEnabled} onChange={(v) => toggle("monitors", v)} icon={<Eye size={14} />} />
          </div>

          {monitors.length > 0 && (
            <div className="text-xs text-text-muted flex items-center gap-1">
              <Eye size={10} />
              모니터 {monitors.length}개
              {totalFailures > 0 && <span className="text-warning"> · 장애 {totalFailures}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
