import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Pin,
  PinOff,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { api, type DashboardEvent } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRefresh?: () => void;
}

const SEVERITY_CONFIG = {
  critical: {
    color: "text-danger",
    bg: "bg-danger/10",
    border: "border-danger/30",
    icon: XCircle,
    label: "Critical",
  },
  warning: {
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/30",
    icon: AlertTriangle,
    label: "Warning",
  },
  info: {
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    icon: Info,
    label: "Info",
  },
  success: {
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/30",
    icon: CheckCircle2,
    label: "Success",
  },
} as const;

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const t = new Date(timestamp);
  const diffMs = now.getTime() - t.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function EventTimeline({ collapsed, pinned, onToggleCollapse, onTogglePin, onRefresh }: Props) {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setError(null);
    try {
      const data = await api.events(24, filter ?? undefined);
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이벤트 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 30_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
    onRefresh?.();
  };

  // severity 카운트
  const counts = events.reduce(
    (acc, ev) => {
      acc[ev.severity] = (acc[ev.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 flex items-center justify-center min-h-[120px]">
        <span className="text-sm text-text-muted">로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-danger/20 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-danger" />
            <h3 className="font-semibold text-sm text-text">Events</h3>
          </div>
          <button onClick={fetchEvents} className="text-xs text-primary hover:underline">
            재시도
          </button>
        </div>
        <div className="text-xs text-danger">{error}</div>
      </div>
    );
  }

  return (
    <div
      className={`bg-surface border rounded-2xl transition-all card-glow card-transition ${
        pinned ? "border-primary/50" : "border-border/60"
      } ${collapsed ? "p-3" : "p-5"}`}
      style={{ animation: "slideUp 0.3s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">Events</h3>
          {events.length > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-mono">
              {events.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleRefresh}
            className={`p-1.5 rounded-lg transition-colors text-text-muted/40 hover:text-text-muted hover:bg-surface-hover ${refreshing ? "animate-spin" : ""}`}
            title="새로고침"
          >
            <RefreshCw size={14} />
          </button>
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
        <div className="flex items-center gap-3 mt-2">
          {(["critical", "warning", "success", "info"] as const).map((sev) => {
            const cfg = SEVERITY_CONFIG[sev];
            const count = counts[sev] || 0;
            if (count === 0) return null;
            return (
              <span key={sev} className={`text-[10px] flex items-center gap-1 ${cfg.color}`}>
                <cfg.icon size={10} />
                {count}
              </span>
            );
          })}
          {events.length === 0 && <span className="text-[10px] text-text-muted">이벤트 없음</span>}
        </div>
      ) : (
        <div className="mt-3">
          {/* Severity 필터 */}
          <div className="flex items-center gap-1 mb-3">
            <button
              onClick={() => setFilter(null)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                filter === null ? "bg-primary/20 text-primary" : "text-text-muted hover:bg-surface-hover"
              }`}
            >
              전체
            </button>
            {(["critical", "warning", "success", "info"] as const).map((sev) => {
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <button
                  key={sev}
                  onClick={() => setFilter(sev)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                    filter === sev ? `${cfg.bg} ${cfg.color}` : "text-text-muted hover:bg-surface-hover"
                  }`}
                >
                  <cfg.icon size={10} />
                  {cfg.label}
                  {(counts[sev] || 0) > 0 && <span className="font-mono">({counts[sev]})</span>}
                </button>
              );
            })}
          </div>

          {/* 이벤트 목록 */}
          {events.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-xs">
              최근 24시간 이벤트 없음
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {events.slice(0, 20).map((ev) => {
                const cfg = SEVERITY_CONFIG[ev.severity] || SEVERITY_CONFIG.info;
                const Icon = cfg.icon;
                return (
                  <div
                    key={ev.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${cfg.bg} ${cfg.border} transition-all`}
                  >
                    <Icon size={14} className={`${cfg.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text leading-tight truncate">{ev.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-muted font-mono">{ev.service_name}</span>
                        <span className="text-[10px] text-text-muted">{formatTimeAgo(ev.timestamp)}</span>
                        <span className="text-[10px] text-text-muted/50">{formatTime(ev.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
