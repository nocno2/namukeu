import { useCallback, useEffect, useState } from "react";
import { api, type TrainReservation, type TrainSummary } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  reserved: "text-success bg-success/10 border-success/20",
  searching: "text-warning bg-warning/10 border-warning/20",
  pending: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  failed: "text-danger bg-danger/10 border-danger/20",
  cancelled: "text-text-muted bg-bg border-border",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || "text-text-muted bg-bg border-border";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${cls}`}>
      {status}
    </span>
  );
}

function formatTime(hhmm?: string): string {
  if (!hhmm || hhmm.length !== 4) return "";
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
}

function formatDate(yyyymmdd?: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd || "";
  return `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6)}`;
}

function MacroItem({ r }: { r: TrainReservation }) {
  return (
    <div className="bg-bg/50 border border-border rounded-lg px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[10px] text-text-muted font-mono uppercase">{r.provider}</span>
          <span className="font-medium">{r.dep_station} → {r.arr_station}</span>
        </div>
        <StatusBadge status={r.status || "searching"} />
      </div>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
        <span>{formatDate(r.date)}</span>
        <span>{formatTime(r.time_range_start)}~{formatTime(r.time_range_end)}</span>
        <span>{r.seat_type === "special" ? "특실" : "일반"}</span>
      </div>
    </div>
  );
}

export function TrainStatus({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [data, setData] = useState<TrainSummary | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setData(await api.trainSummary());
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

  if (error || !data) return null;

  return (
    <div className={`bg-surface border rounded-xl ${pinned ? "border-primary/40" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Train Go</h3>
          {data.active_macros > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
            </span>
          )}
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
          <span className="text-text-muted">Active</span>
          <span className="font-mono">{data.active_macros}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">Reserved</span>
          <span className="font-mono">{data.by_status.reserved || 0}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">Total</span>
          <span className="font-mono">{data.total_reservations}</span>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Summary */}
          <div className="flex gap-4">
            <div>
              <div className="text-2xl font-bold">{data.active_macros}</div>
              <div className="text-[10px] text-text-muted">활성 매크로</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{data.total_reservations}</div>
              <div className="text-[10px] text-text-muted">전체 예약</div>
            </div>
          </div>

          {/* Status breakdown */}
          {Object.keys(data.by_status).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.by_status).map(([status, count]) => (
                <span key={status} className="text-[10px] text-text-muted">
                  <StatusBadge status={status} /> <span className="font-mono">{count}</span>
                </span>
              ))}
            </div>
          )}

          {/* Active macros */}
          {data.active_reservations.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-1.5">매크로 등록 현황</div>
              <div className="space-y-1.5">
                {data.active_reservations.map((r, i) => (
                  <MacroItem key={r.id ?? i} r={r} />
                ))}
              </div>
            </div>
          )}

          {/* Recent reservations */}
          {data.recent_reservations.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-1.5">최근 예약</div>
              <div className="space-y-1.5">
                {data.recent_reservations.slice(0, 5).map((r, i) => (
                  <div key={r.id ?? i} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[10px] text-text-muted font-mono uppercase">{r.provider}</span>
                      <span className="truncate">{r.dep_station} → {r.arr_station}</span>
                      <span className="text-[10px] text-text-muted">{formatDate(r.date)}</span>
                    </div>
                    <StatusBadge status={r.status || "unknown"} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
