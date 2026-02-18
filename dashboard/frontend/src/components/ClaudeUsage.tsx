import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Coins,
  Pin,
  PinOff,
  RefreshCw,
  Sparkles,
} from "lucide-react";
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
  icon,
}: {
  label: string;
  utilization: number;
  resetsAt: string;
  icon: React.ReactNode;
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
        <span className="text-text-muted flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-mono text-text">{utilization}%</span>
      </div>
      <div className="w-full h-2 bg-border/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${utilization}%` }}
        />
      </div>
      <div className="text-[10px] text-text-muted mt-1 flex items-center gap-1">
        <RefreshCw size={10} />
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
  const [currentModel, setCurrentModel] = useState<"claude" | "minimax">("claude");
  const [switching, setSwitching] = useState(false);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await api.claudeUsage();
      setUsage(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const fetchModel = useCallback(async () => {
    try {
      const data = await api.claudeModel();
      setCurrentModel(data.model as "claude" | "minimax");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    fetchModel();
    const interval = setInterval(fetchUsage, 60_000);
    return () => clearInterval(interval);
  }, [fetchUsage, fetchModel]);

  const handleModelSwitch = async () => {
    const next = currentModel === "claude" ? "minimax" : "claude";
    setSwitching(true);
    try {
      await api.setClaudeModel(next);
      setCurrentModel(next);
    } catch {
      // ignore
    } finally {
      setSwitching(false);
    }
  };

  if (error) return null;
  if (!usage) return null;

  const isMinimax = currentModel === "minimax";

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
          <Bot size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">Claude Code</h3>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Model switch button */}
          <button
            onClick={handleModelSwitch}
            disabled={switching}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono transition-colors ${
              isMinimax
                ? "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            } disabled:opacity-50`}
            title={isMinimax ? "Claude로 전환" : "MiniMax M2.5로 전환"}
          >
            {switching ? (
              <RefreshCw size={10} className="animate-spin" />
            ) : isMinimax ? (
              <Sparkles size={10} />
            ) : (
              <Bot size={10} />
            )}
            {isMinimax ? "M2.5" : "Claude"}
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
          {usage.five_hour && <CompactUsage label="5h" utilization={usage.five_hour.utilization} />}
          {usage.seven_day && <CompactUsage label="7d" utilization={usage.seven_day.utilization} />}
          {isMinimax && (
            <span className="text-[10px] text-violet-400 font-mono">M2.5</span>
          )}
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          {usage.five_hour && (
            <UsageBar
              label="5시간"
              utilization={usage.five_hour.utilization}
              resetsAt={usage.five_hour.resets_at}
              icon={<Coins size={12} />}
            />
          )}
          {usage.seven_day && (
            <UsageBar
              label="7일"
              utilization={usage.seven_day.utilization}
              resetsAt={usage.seven_day.resets_at}
              icon={<Coins size={12} />}
            />
          )}
          {isMinimax && (
            <div className="text-[10px] text-violet-400/70 pt-2 border-t border-border/60 flex items-center gap-1">
              <Sparkles size={10} />
              현재 MiniMax M2.5 사용 중 — 새 Claude Code 세션부터 적용됩니다
            </div>
          )}
        </div>
      )}
    </div>
  );
}
