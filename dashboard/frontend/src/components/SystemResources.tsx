import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, HardDrive, MemoryStick, Pin, PinOff, RefreshCw, Server } from "lucide-react";
import { api, type SystemResources as SystemResourcesData } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRefresh?: () => void;
}

function ResourceBar({ label, percent, detail, icon }: { label: string; percent: number; detail: string; icon: React.ReactNode }) {
  const color = percent >= 80 ? "bg-danger" : percent >= 50 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-muted flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-mono text-text">{detail}</span>
      </div>
      <div className="w-full h-2 bg-border/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function CompactStat({ label, percent }: { label: string; percent: number }) {
  const color = percent >= 80 ? "text-danger" : percent >= 50 ? "text-warning" : "text-success";
  return (
    <span className="text-[10px]">
      <span className="text-text-muted">{label}</span>{" "}
      <span className={`font-mono ${color}`}>{percent}%</span>
    </span>
  );
}

export function SystemResources({ collapsed, pinned, onToggleCollapse, onTogglePin, onRefresh }: Props) {
  const [data, setData] = useState<SystemResourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const result = await api.systemResources();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    onRefresh?.();
  };

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
            <Server size={16} className="text-danger" />
            <h3 className="font-semibold text-sm text-text">System</h3>
          </div>
          <button
            onClick={fetchData}
            className="text-xs text-primary hover:underline"
          >
            재시도
          </button>
        </div>
        <div className="text-xs text-danger">{error}</div>
      </div>
    );
  }

  if (!data) return null;

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
          <Server size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">System</h3>
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
          <CompactStat label="CPU" percent={data.cpu_percent} />
          <CompactStat label="MEM" percent={data.memory.percent} />
          <CompactStat label="DISK" percent={data.disk.percent} />
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          <ResourceBar
            label="CPU"
            percent={data.cpu_percent}
            detail={`${data.cpu_percent}%`}
            icon={<Server size={12} />}
          />
          <ResourceBar
            label="Memory"
            percent={data.memory.percent}
            detail={`${data.memory.used_gb} / ${data.memory.total_gb} GB`}
            icon={<MemoryStick size={12} />}
          />
          <ResourceBar
            label="Disk"
            percent={data.disk.percent}
            detail={`${data.disk.used_gb} / ${data.disk.total_gb} GB`}
            icon={<HardDrive size={12} />}
          />
        </div>
      )}
    </div>
  );
}
