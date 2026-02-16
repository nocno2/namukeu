import { useCallback, useEffect, useState } from "react";
import { api, type ScheduledTask } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function LaunchAgents({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [error, setError] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.scheduledTasks();
      setTasks(data.tasks);
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

  const handleToggle = async (taskId: string, enabled: boolean) => {
    setToggling(taskId);
    try {
      await api.toggleScheduledTask(taskId, enabled);
      await fetchData();
    } catch (err) {
      console.error("Failed to toggle task:", err);
    } finally {
      setToggling(null);
    }
  };

  if (error || tasks.length === 0) return null;

  return (
    <div className={`bg-surface border rounded-xl ${pinned ? "border-primary/40" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <h3 className="font-semibold text-sm">예약 작업</h3>
          <span className="text-[10px] text-text-muted font-mono">{tasks.length}개</span>
        </div>
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
          <span className="font-mono">{tasks.length}개</span>
          <span className="text-text-muted">등록됨</span>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-lg bg-background/50 border border-border/50 p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(t.id, !t.enabled)}
                    disabled={toggling === t.id}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      t.enabled ? "bg-primary" : "bg-border"
                    } ${toggling === t.id ? "opacity-50" : ""}`}
                    title={t.enabled ? "비활성화" : "활성화"}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        t.enabled ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className={`font-medium text-sm ${!t.enabled ? "text-text-muted" : ""}`}>
                    {t.display_name}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {t.schedule}
                </span>
              </div>

              {t.description && (
                <p className="text-[11px] text-text-muted mb-2 ml-9">{t.description}</p>
              )}

              {t.last_run && (
                <div className="flex items-center gap-1 text-[10px] text-text-muted ml-9">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span>마지막 실행: {formatRelativeTime(t.last_run)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
