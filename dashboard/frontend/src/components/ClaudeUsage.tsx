import { useCallback, useEffect, useState } from "react";
import { api, type ClaudeUsage as ClaudeUsageData } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "곧 갱신";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 후`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours < 24) return `${hours}시간 ${remainMins}분 후`;
  const days = Math.floor(hours / 24);
  return `${days}일 ${hours % 24}시간 후`;
}

function UsageBar({
  label,
  utilization,
  resetsAt,
}: {
  label: string;
  utilization: number;
  resetsAt: string;
}) {
  const barColor =
    utilization >= 80
      ? "bg-danger"
      : utilization >= 50
        ? "bg-warning"
        : "bg-success";

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono">{utilization}%</span>
      </div>
      <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${utilization}%` }}
        />
      </div>
      <div className="text-[10px] text-text-muted mt-1">
        갱신 {timeUntil(resetsAt)}
      </div>
    </div>
  );
}

function CompactUsage({ label, utilization }: { label: string; utilization: number }) {
  const color =
    utilization >= 80 ? "text-danger" : utilization >= 50 ? "text-warning" : "text-success";
  return (
    <span className="text-[10px]">
      <span className="text-text-muted">{label}</span>{" "}
      <span className={`font-mono ${color}`}>{utilization}%</span>
    </span>
  );
}

export function ClaudeUsage({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [usage, setUsage] = useState<ClaudeUsageData | null>(null);
  const [error, setError] = useState(false);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await api.claudeUsage();
      setUsage(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  if (error) return null;
  if (!usage) return null;

  return (
    <div className={`bg-surface border rounded-xl ${pinned ? "border-primary/40" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Claude Code</h3>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onTogglePin}
            className={`p-1 rounded transition-colors ${
              pinned ? "text-primary" : "text-text-muted/40 hover:text-text-muted"
            }`}
            title={pinned ? "고정 해제" : "상단 고정"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" />
            </svg>
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1 text-text-muted/40 hover:text-text-muted rounded transition-colors"
            title={collapsed ? "펼치기" : "접기"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {collapsed ? (
                <polyline points="6 9 12 15 18 9" />
              ) : (
                <polyline points="6 15 12 9 18 15" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="flex items-center gap-3 mt-1.5">
          {usage.five_hour && <CompactUsage label="5h" utilization={usage.five_hour.utilization} />}
          {usage.seven_day && <CompactUsage label="7d" utilization={usage.seven_day.utilization} />}
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          {usage.five_hour && (
            <UsageBar
              label="5시간"
              utilization={usage.five_hour.utilization}
              resetsAt={usage.five_hour.resets_at}
            />
          )}
          {usage.seven_day && (
            <UsageBar
              label="7일"
              utilization={usage.seven_day.utilization}
              resetsAt={usage.seven_day.resets_at}
            />
          )}
        </div>
      )}
    </div>
  );
}
