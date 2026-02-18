import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Pin,
  PinOff,
  RotateCcw,
} from "lucide-react";
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
    <div
      className={`bg-surface border border-border rounded-2xl transition-all card-glow card-transition ${
        pinned ? "border-primary/50" : "border-border/60"
      } ${collapsed ? "p-3" : "p-5"}`}
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">예약 작업</h3>
          <span className="text-[10px] text-text-muted font-mono">{tasks.length}개</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
            }`}
            title={pinned ? "고정 해제" : "상단 고정"}
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
            title={collapsed ? "펼치기" : "접기"}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="flex items-center gap-2 mt-2 text-[10px]">
          <span className="font-mono text-text">{tasks.length}개</span>
          <span className="text-text-muted">등록됨</span>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-xl bg-surface-hover/50 border border-border/50 p-3">
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
                  <span className={`font-medium text-sm ${!t.enabled ? "text-text-muted" : "text-text"}`}>
                    {t.display_name}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-primary/10 text-primary">
                  {t.schedule}
                </span>
              </div>

              {t.description && (
                <p className="text-[11px] text-text-muted mb-2 ml-10">{t.description}</p>
              )}

              {t.last_run && (
                <div className="flex items-center gap-1 text-[10px] text-text-muted ml-10">
                  <RotateCcw size={10} />
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
