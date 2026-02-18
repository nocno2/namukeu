import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pin,
  PinOff,
  RefreshCw,
  Train,
  X,
} from "lucide-react";
import { api, type TrainReservation, type TrainSummary } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRefresh?: () => void;
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
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${info.cls}`}>
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

interface ReservationCardProps {
  r: TrainReservation;
  isActive: boolean;
  onCancel?: (id: number) => void;
  canceling?: boolean;
}

function ReservationCard({ r, isActive, onCancel, canceling }: ReservationCardProps) {
  const trainInfo = parseTrainInfo(r);

  return (
    <div className={`rounded-xl px-3 py-2.5 ${isActive ? "bg-warning/5 border border-warning/20" : "bg-surface-hover/50 border border-border/50"}`}>
      {/* 구간 + 상태 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-warning" />
            </span>
          )}
          <span className="font-medium text-sm text-text">{r.dep_station} → {r.arr_station}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={r.status || "pending"} />
          {isActive && onCancel && r.id !== undefined && (
            <button
              onClick={() => onCancel(r.id!)}
              disabled={canceling}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border border-danger/30 text-danger hover:bg-danger/10 transition-colors ${canceling ? "opacity-50 cursor-not-allowed" : ""}`}
              title="매크로 취소"
            >
              취소
            </button>
          )}
        </div>
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
        <div className="mt-1.5 text-[11px] text-success bg-success/5 rounded-lg px-2 py-1">
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

interface AllReservationsModalProps {
  reservations: TrainReservation[];
  activeIds: Set<number | undefined>;
  onClose: () => void;
  onCancel: (id: number) => void;
  cancelingId: number | null;
}

function AllReservationsModal({ reservations, activeIds, onClose, onCancel, cancelingId }: AllReservationsModalProps) {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const totalPages = Math.ceil(reservations.length / pageSize);
  const paged = reservations.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col m-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <h2 className="font-semibold text-lg text-text">전체 예약 내역</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
            <X size={20} className="text-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {paged.map((r, i) => (
            <ReservationCard
              key={r.id ?? i}
              r={r}
              isActive={activeIds.has(r.id)}
              onCancel={activeIds.has(r.id) ? onCancel : undefined}
              canceling={cancelingId === r.id}
            />
          ))}
        </div>

        {/* Footer - Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-border/60">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs rounded-lg border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
            >
              이전
            </button>
            <span className="text-xs text-text-muted">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TrainStatus({ collapsed, pinned, onToggleCollapse, onTogglePin, onRefresh }: Props) {
  const [data, setData] = useState<TrainSummary | null>(null);
  const [error, setError] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    onRefresh?.();
  };

  const handleCancel = async (reservationId: number) => {
    setCancelingId(reservationId);
    try {
      await api.cancelTrainReservation(reservationId);
      await fetchData();
    } catch (err) {
      console.error("Failed to cancel reservation:", err);
      alert("매크로 취소 실패");
    } finally {
      setCancelingId(null);
    }
  };

  if (error || !data) return null;

  const activeIds = new Set(data.active_reservations.map((r) => r.id));
  const allReservations = data.recent_reservations;

  return (
    <>
      <div
        className={`bg-surface border border-border rounded-2xl transition-all card-glow card-transition ${
          pinned ? "border-primary/50" : "border-border/60"
        } ${collapsed ? "p-3" : "p-5"}`}
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Train size={16} className="text-primary" />
            <h3 className="font-semibold text-sm text-text">기차 예약</h3>
            {data.active_macros > 0 && (
              <span className="text-[10px] text-warning font-medium">
                매크로 {data.active_macros}개 실행 중
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
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            {data.active_macros > 0 && (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-warning" />
                </span>
                <span className="text-warning font-medium">검색 중 {data.by_status.searching || 0}</span>
                <span className="text-text-muted/30">•</span>
              </>
            )}
            <span className="text-success">예약 {data.by_status.reserved || 0}</span>
            <span className="text-text-muted/30">•</span>
            <span className="text-text-muted">전체 {data.total_reservations}</span>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {/* 활성 매크로 섹션 */}
            {data.active_reservations.length > 0 && (
              <div>
                <div className="text-[11px] text-text-muted font-medium mb-2 flex items-center gap-1">
                  <Train size={10} />
                  검색 중인 매크로
                </div>
                <div className="space-y-2">
                  {data.active_reservations.map((r, i) => (
                    <ReservationCard
                      key={r.id ?? i}
                      r={r}
                      isActive={true}
                      onCancel={handleCancel}
                      canceling={cancelingId === r.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 최근 예약 1개만 표시 + 전체보기 버튼 */}
            {allReservations.filter((r) => !activeIds.has(r.id)).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-text-muted font-medium">예약 이력</div>
                  {allReservations.length > 1 && (
                    <button
                      onClick={() => setShowAllModal(true)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      전체보기 ({allReservations.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {allReservations
                    .filter((r) => !activeIds.has(r.id))
                    .slice(0, 1)
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

      {/* 전체 내역 모달 */}
      {showAllModal && (
        <AllReservationsModal
          reservations={allReservations}
          activeIds={activeIds}
          onClose={() => setShowAllModal(false)}
          onCancel={handleCancel}
          cancelingId={cancelingId}
        />
      )}
    </>
  );
}
