import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  ExternalLink,
  Pin,
  PinOff,
  Play,
  Workflow,
} from "lucide-react";
import { api, type N8nStatus as N8nStatusData } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "없음";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function CompactStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-[10px]">
      <span className="text-text-muted">{label}</span>{" "}
      <span className="font-mono text-text">{value}</span>
    </span>
  );
}

export function N8nStatus({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [data, setData] = useState<N8nStatusData | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const result = await api.n8nStatus();
      setData(result);
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

  if (error && !data) return null;
  if (!data) return null;

  const isRunning = data.status === "running";

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
          <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? "bg-success status-pulse" : "bg-danger"}`} />
          <Workflow size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">n8n</h3>
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
          {isRunning ? (
            <>
              <CompactStat label="워크플로우" value={data.active_workflows} />
              <span className="text-text-muted/30">•</span>
              <CompactStat label="오늘" value={data.today_executions} />
            </>
          ) : (
            <span className="text-danger">Down</span>
          )}
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          {/* Stats */}
          <div className="flex gap-6">
            <div>
              <div className="text-2xl font-bold text-text">{data.active_workflows}</div>
              <div className="text-[10px] text-text-muted">활성 워크플로우</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-text">{data.today_executions}</div>
              <div className="text-[10px] text-text-muted">오늘 실행</div>
            </div>
          </div>

          {/* Success/Fail */}
          {data.today_executions > 0 && (
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <CircleDot size={10} className="text-success" />
                <span className="text-success">{data.success_count} 성공</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CircleDot size={10} className="text-danger" />
                <span className="text-danger">{data.fail_count} 실패</span>
              </div>
            </div>
          )}

          {/* Last execution */}
          <div className="text-[10px] text-text-muted flex items-center gap-1">
            <Play size={10} />
            마지막 실행: {timeAgo(data.last_execution)}
          </div>

          {/* n8n link */}
          <a
            href="http://127.0.0.1:5678"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl py-2.5 transition-colors font-medium"
          >
            n8n 열기
            <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  );
}
