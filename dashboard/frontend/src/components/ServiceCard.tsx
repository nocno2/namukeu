import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CloudOff,
  FileText,
  Gauge,
  Link,
  Pin,
  PinOff,
  RefreshCw,
  Server,
  Terminal,
} from "lucide-react";
import { api, type Incident, type ServiceStatus, type UptimeBlock } from "../lib/api";

interface Props {
  service: ServiceStatus;
  collapsed: boolean;
  pinned: boolean;
  onClick: () => void;
  onRefresh: () => void;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onShowLogs: () => void;
  badge?: { count: number; label: string } | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  http: <Link size={12} />,
  process: <Terminal size={12} />,
  self: <Server size={12} />,
};

const TYPE_LABELS: Record<string, string> = {
  http: "HTTP",
  process: "Process",
  self: "Self",
};

function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text">{value}</span>
    </div>
  );
}

function formatDetails(details: Record<string, unknown>): [string, string | number][] {
  const items: [string, string | number][] = [];
  for (const [key, val] of Object.entries(details)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "object") {
      for (const [k2, v2] of Object.entries(val as Record<string, unknown>)) {
        if (v2 !== null && v2 !== undefined && typeof v2 !== "object") {
          items.push([k2, String(v2)]);
        }
      }
    } else {
      items.push([key, typeof val === "number" ? val : String(val)]);
    }
  }
  return items.slice(0, 6);
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-success",
  down: "bg-danger",
  no_data: "bg-text-muted/20",
};

function UptimeBar({ blocks, uptimePercent }: { blocks: UptimeBlock[]; uptimePercent: number | null }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <Gauge size={10} />
          24h 업타임
        </span>
        {uptimePercent !== null && (
          <span className={`text-[10px] font-mono font-medium ${uptimePercent >= 99 ? "text-success" : uptimePercent >= 90 ? "text-warning" : "text-danger"}`}>
            {uptimePercent}%
          </span>
        )}
      </div>
      <div className="flex gap-[1px] h-2 rounded-full overflow-hidden bg-border/30">
        {blocks.map((block, i) => (
          <div
            key={i}
            className={`flex-1 ${STATUS_COLORS[block.status] || STATUS_COLORS.no_data}`}
            title={`${new Date(block.start).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} — ${block.status === "running" ? "정상" : block.status === "down" ? "다운" : "데이터 없음"}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-text-muted/50">24h ago</span>
        <span className="text-[9px] text-text-muted/50">now</span>
      </div>
    </div>
  );
}

function formatDuration(sec: number | null): string {
  if (sec === null) return "진행 중";
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function IncidentList({ incidents }: { incidents: Incident[] }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <span className="text-[10px] text-text-muted mb-1.5 block flex items-center gap-1">
        <Activity size={10} />
        최근 인시던트
      </span>
      <div className="space-y-1.5">
        {incidents.map((inc) => (
          <div key={inc.id} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inc.resolved_at ? "bg-text-muted/30" : "bg-danger"}`} />
              <span className="text-text-muted truncate">
                {new Date(inc.started_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}{" "}
                {new Date(inc.started_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-text-muted">{formatDuration(inc.duration_sec)}</span>
              {inc.auto_recovered ? (
                <span className="text-[9px] bg-success/15 text-success border border-success/20 px-1.5 py-0.5 rounded-full">자동복구</span>
              ) : inc.resolved_at ? (
                <span className="text-[9px] bg-text-muted/10 text-text-muted border border-border px-1.5 py-0.5 rounded-full">수동복구</span>
              ) : (
                <span className="text-[9px] bg-danger/15 text-danger border border-danger/20 px-1.5 py-0.5 rounded-full">진행중</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return "방금";
  if (secs < 60) return `${secs}초 전`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  return `${hours}시간 전`;
}

export function ServiceCard({ service, collapsed, pinned, onClick, onRefresh, onToggleCollapse, onTogglePin, onShowLogs, badge }: Props) {
  const isRunning = service.status === "running";
  const canRestart = service.type !== "self";
  const [restarting, setRestarting] = useState(false);
  const [uptimeBlocks, setUptimeBlocks] = useState<UptimeBlock[]>([]);
  const [uptimePercent, setUptimePercent] = useState<number | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.serviceUptime(service.name).then((data) => {
      if (!cancelled) {
        setUptimeBlocks(data.blocks);
        setUptimePercent(data.uptime_percent);
      }
    }).catch(() => {});
    api.serviceIncidents(service.name, 30).then((data) => {
      if (!cancelled) {
        setIncidents(data.incidents.slice(0, 3));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [service.name, service.checked_at]);

  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`${service.display_name}을(를) 재시작하시겠습니까?`)) return;

    setRestarting(true);
    try {
      await api.restart(service.name);
      setTimeout(onRefresh, 2000);
    } catch (err) {
      alert(`재시작 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
    } finally {
      setRestarting(false);
    }
  };

  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCollapse();
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin();
  };

  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-border rounded-2xl transition-all cursor-pointer card-glow card-transition ${
        pinned ? "border-primary/50" : "border-border/60"
      } ${collapsed ? "p-3" : "p-5"} hover:bg-surface-hover`}
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isRunning ? "bg-success status-pulse" : "bg-danger"
            }`}
          />
          <h3 className="font-semibold text-sm truncate text-text">{service.display_name}</h3>
          {badge && badge.count > 0 && (
            <span className="text-[10px] bg-warning/15 text-warning border border-warning/20 px-2 py-0.5 rounded-full shrink-0 font-medium">
              {badge.count} {badge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handlePin}
            className={`p-1.5 rounded-lg transition-colors ${
              pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
            }`}
            title={pinned ? "고정 해제" : "상단 고정"}
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={handleCollapse}
            className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
            title={collapsed ? "펼치기" : "접기"}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {collapsed ? (
        /* Collapsed: minimal info */
        <div className="flex items-center gap-2 mt-2 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            {TYPE_ICONS[service.type] || <Server size={12} />}
            {TYPE_LABELS[service.type] || service.type}
          </span>
          {service.port && <span className="font-mono">:{service.port}</span>}
          <span className="text-text-muted/30">•</span>
          <span>{timeAgo(service.checked_at)}</span>
        </div>
      ) : (
        /* Expanded: full view */
        <>
          <p className="text-xs text-text-muted mt-2 ml-5">{service.description}</p>

          {/* Meta */}
          <div className="flex gap-2 mt-3 mb-3">
            <span className="text-[10px] text-text-muted bg-surface-hover px-2.5 py-1 rounded-lg border border-border/50 flex items-center gap-1.5">
              {TYPE_ICONS[service.type] || <Server size={12} />}
              {TYPE_LABELS[service.type] || service.type}
            </span>
            {service.port && (
              <span className="text-[10px] text-text-muted bg-surface-hover px-2.5 py-1 rounded-lg border border-border/50 font-mono">
                :{service.port}
              </span>
            )}
          </div>

          {/* Details */}
          {service.details && (
            <div className="space-y-1.5 border-t border-border/60 pt-3">
              {formatDetails(service.details).map(([label, value]) => (
                <DetailItem key={label} label={label} value={value} />
              ))}
            </div>
          )}

          {/* Uptime Bar */}
          {uptimeBlocks.length > 0 && (
            <UptimeBar blocks={uptimeBlocks} uptimePercent={uptimePercent} />
          )}

          {/* Recent Incidents */}
          {incidents.length > 0 && (
            <IncidentList incidents={incidents} />
          )}

          {/* Actions */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {service.dashboard_url && isRunning && (
              <a
                href={service.dashboard_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center gap-1.5 text-xs text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl py-2 transition-colors font-medium"
              >
                대시보드
                <ArrowRight size={12} />
              </a>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onShowLogs(); }}
              className="flex items-center justify-center gap-1.5 text-xs text-text-muted bg-surface-hover hover:bg-border/50 border border-border/50 rounded-xl py-2 transition-colors cursor-pointer"
            >
              <FileText size={14} />
              로그
            </button>
            {canRestart && (
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="flex items-center justify-center gap-1.5 text-xs text-warning bg-warning/10 hover:bg-warning/20 disabled:opacity-50 border border-warning/20 rounded-xl py-2 transition-colors cursor-pointer font-medium"
              >
                <RefreshCw size={14} className={restarting ? "animate-spin" : ""} />
                {restarting ? "재시작 중..." : "재시작"}
              </button>
            )}
          </div>

          {/* Checked at */}
          <div className="mt-3 text-[10px] text-text-muted/50 flex items-center gap-1">
            <CloudOff size={10} />
            {timeAgo(service.checked_at)}
          </div>
        </>
      )}
    </div>
  );
}
