import { useCallback, useEffect, useState } from "react";
import { api, type TrainReservation, type TrainSummary } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  searching: { label: "검색 중", cls: "text-warning bg-warning/10 border-warning/20" },
  reserved: { label: "예약 완료", cls: "text-success bg-success/10 border-success/20" },
  pending: { label: "대기", cls: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  failed: { label: "실패", cls: "text-danger bg-danger/10 border-danger/20" },
  timeout: { label: "시간 초과", cls: "text-text-muted bg-bg border-border" },
  cancelled: { label: "취소", cls: "text-text-muted bg-bg border-border" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_MAP[status] || { label: status, cls: "text-text-muted bg-bg border-border" };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${info.cls}`}>
      {info.label}
    </span>
  );
}

function formatTime(hhmm?: string): string {
  if (!hhmm || hhmm.length < 4) return "";
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
}

function formatDate(yyyymmdd?: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd || "";
  const m = parseInt(yyyymmdd.slice(4, 6));
  const d = parseInt(yyyymmdd.slice(6));
  return `${m}월 ${d}일`;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function parseTrainInfo(r: TrainReservation): string | null {
  if (!r.train_info) return null;
  try {
    const info = typeof r.train_info === "string" ? JSON.parse(r.train_info) : r.train_info;
    if (info.reservation) return info.reservation;
    const depTime = formatTime(info.dep_time?.slice(0, 4));
    const arrTime = formatTime(info.arr_time?.slice(0, 4));
    return `${info.train_name || ""} ${info.dep_station}→${info.arr_station} ${depTime}~${arrTime}`;
  } catch {
    return null;
  }
}

function ReservationCard({ r, isActive }: { r: TrainReservation; isActive: boolean }) {
  const trainInfo = parseTrainInfo(r);

  return (
    <div className={`rounded-lg px-3 py-2.5 ${isActive ? "bg-warning/5 border border-warning/20" : "bg-bg/50 border border-border"}`}>
      {/* 구간 + 상태 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-warning" />
            </span>
          )}
          <span className="font-medium text-sm">{r.dep_station} → {r.arr_station}</span>
        </div>
        <StatusBadge status={r.status || "pending"} />
      </div>

      {/* 상세 정보 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-text-muted">
        <span>{formatDate(r.date)}</span>
        <span>{formatTime(r.time_range_start)}~{formatTime(r.time_range_end)}</span>
        <span className="uppercase text-[10px] font-mono">{r.provider}</span>
        <span>{r.seat_type === "special" ? "특실" : "일반실"}</span>
      </div>

      {/* 예약 성공 시 열차 정보 */}
      {trainInfo && (
        <div className="mt-1.5 text-[11px] text-success bg-success/5 rounded px-2 py-1">
          {trainInfo}
        </div>
      )}

      {/* 등록 시간 */}
      <div className="mt-1 text-[10px] text-text-muted/60">
        등록 {timeAgo(r.created_at)}
        {r.reserved_at && <> · 예약 {timeAgo(r.reserved_at)}</>}
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

  const activeIds = new Set(data.active_reservations.map((r) => r.id));
  const allReservations = data.recent_reservations;

  return (
    <div className={`bg-surface border rounded-xl ${pinned ? "border-primary/40" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">기차 예약</h3>
          {data.active_macros > 0 && (
            <span className="text-[10px] text-warning font-medium">
              매크로 {data.active_macros}개 실행 중
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
          {data.active_macros > 0 && (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-warning" />
              </span>
              <span className="text-warning font-medium">검색 중 {data.by_status.searching || 0}</span>
              <span className="text-text-muted">·</span>
            </>
          )}
          <span className="text-success">예약 {data.by_status.reserved || 0}</span>
          <span className="text-text-muted">· 전체 {data.total_reservations}</span>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* 활성 매크로 섹션 */}
          {data.active_reservations.length > 0 && (
            <div>
              <div className="text-[11px] text-text-muted font-medium mb-2">검색 중인 매크로</div>
              <div className="space-y-2">
                {data.active_reservations.map((r, i) => (
                  <ReservationCard key={r.id ?? i} r={r} isActive={true} />
                ))}
              </div>
            </div>
          )}

          {/* 완료된 예약 / 전체 이력 */}
          {allReservations.filter((r) => !activeIds.has(r.id)).length > 0 && (
            <div>
              <div className="text-[11px] text-text-muted font-medium mb-2">예약 이력</div>
              <div className="space-y-2">
                {allReservations
                  .filter((r) => !activeIds.has(r.id))
                  .slice(0, 5)
                  .map((r, i) => (
                    <ReservationCard key={r.id ?? i} r={r} isActive={false} />
                  ))}
              </div>
            </div>
          )}

          {allReservations.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">등록된 예약이 없습니다</div>
          )}
        </div>
      )}
    </div>
  );
}
