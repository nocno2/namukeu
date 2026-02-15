import { useCallback, useEffect, useState } from "react";
import { api, type SystemResources as SystemResourcesData } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

function ResourceBar({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const color = percent >= 80 ? "bg-danger" : percent >= 50 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono">{detail}</span>
      </div>
      <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
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

export function SystemResources({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [data, setData] = useState<SystemResourcesData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setData(await api.systemResources());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!data) return null;

  return (
    <div className={`bg-surface border rounded-xl ${pinned ? "border-primary/40" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">System</h3>
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
        <div className="flex items-center gap-3 mt-1.5">
          <CompactStat label="CPU" percent={data.cpu_percent} />
          <CompactStat label="MEM" percent={data.memory.percent} />
          <CompactStat label="DISK" percent={data.disk.percent} />
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          <ResourceBar label="CPU" percent={data.cpu_percent} detail={`${data.cpu_percent}%`} />
          <ResourceBar label="Memory" percent={data.memory.percent} detail={`${data.memory.used_gb} / ${data.memory.total_gb} GB`} />
          <ResourceBar label="Disk" percent={data.disk.percent} detail={`${data.disk.used_gb} / ${data.disk.total_gb} GB`} />
        </div>
      )}
    </div>
  );
}
