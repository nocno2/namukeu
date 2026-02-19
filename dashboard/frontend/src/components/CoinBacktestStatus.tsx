import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { api, type BacktestResult, type BacktestValidation } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRefresh?: () => void;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function ValidationBadge({ resultId }: { resultId: number }) {
  const [validation, setValidation] = useState<BacktestValidation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.coinBacktestValidate(resultId)
      .then(setValidation)
      .catch(() => setValidation(null))
      .finally(() => setLoading(false));
  }, [resultId]);

  if (loading) {
    return <Loader2 size={12} className="animate-spin text-text-muted" />;
  }

  if (!validation) {
    return <AlertCircle size={12} className="text-text-muted" />;
  }

  const { can_live_trade, can_paper_trade, reasons } = validation.eligibility;

  if (can_live_trade) {
    return (
      <span className="text-[10px] flex items-center gap-1 text-success bg-success/10 px-1.5 py-0.5 rounded-full border border-success/20">
        <CheckCircle size={10} />
        라이브 가능
      </span>
    );
  }

  if (can_paper_trade) {
    return (
      <span className="text-[10px] flex items-center gap-1 text-warning bg-warning/10 px-1.5 py-0.5 rounded-full border border-warning/20">
        <TrendingUp size={10} />
        페이퍼 가능
      </span>
    );
  }

  return (
    <span className="text-[10px] flex items-center gap-1 text-text-muted bg-surface-hover px-1.5 py-0.5 rounded-full border border-border" title={reasons.join(", ")}>
      <AlertCircle size={10} />
      조건 미달
    </span>
  );
}

export function CoinBacktestStatus({ collapsed, pinned, onToggleCollapse, onTogglePin, onRefresh }: Props) {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [mode, setMode] = useState<"paper" | "live" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchResults = useCallback(async () => {
    try {
      const data = await api.coinBacktestResults(10);
      setResults(data);
    } catch (e) {
      console.error("Failed to fetch backtest results:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleStartTrading = async (resultId: number, tradeMode: "paper" | "live") => {
    setStartingId(resultId);
    setMode(tradeMode);
    setError(null);
    setSuccess(null);

    try {
      if (tradeMode === "paper") {
        const res = await api.coinStartPaperTrading(resultId);
        setSuccess(`페이퍼 트레이딩 시작: ${res.message}`);
      } else {
        const res = await api.coinStartLiveTrading(resultId);
        setSuccess(`라이브 트레이딩 시작: ${res.message}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작 실패");
    } finally {
      setStartingId(null);
      setMode(null);
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    await fetchResults();
    setRefreshing(false);
    onRefresh?.();
  };

  if (collapsed) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary status-pulse" />
            <span className="font-semibold text-sm text-text">COIN 백테스트</span>
            {results.length > 0 && (
              <span className="text-[10px] text-text-muted bg-surface-hover px-2 py-0.5 rounded-full">
                {results.length}건
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleRefresh}
              className={`p-1.5 rounded-lg transition-colors text-text-muted/40 hover:text-text-muted hover:bg-surface-hover ${refreshing ? "animate-spin" : ""}`}
              title="새로고침"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
              className={`p-1.5 rounded-lg transition-colors ${
                pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
              }`}
              title={pinned ? "고정 해제" : "상단 고정"}
            >
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
              className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
              title="펼치기"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary status-pulse" />
          <h3 className="font-semibold text-sm text-text">COIN 백테스트</h3>
          {results.length > 0 && (
            <span className="text-[10px] text-text-muted bg-surface-hover px-2 py-0.5 rounded-full">
              {results.length}건
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleRefresh}
            className={`p-1.5 rounded-lg transition-colors text-text-muted/40 hover:text-text-muted hover:bg-surface-hover ${refreshing ? "animate-spin" : ""}`}
            title="새로고침"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={`p-1.5 rounded-lg transition-colors ${
              pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
            }`}
            title={pinned ? "고정 해제" : "상단 고정"}
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
            className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
            title="접기"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>

      {/* Success/Error messages */}
      {success && (
        <div className="mt-3 p-2 bg-success/10 border border-success/20 rounded-lg text-xs text-success">
          {success}
        </div>
      )}
      {error && (
        <div className="mt-3 p-2 bg-danger/10 border border-danger/20 rounded-lg text-xs text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center justify-center gap-2 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" />
          로딩 중...
        </div>
      ) : results.length === 0 ? (
        <div className="mt-4 text-center text-text-muted text-sm py-4">
          백테스트 결과가 없습니다
        </div>
      ) : (
        <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.id}
              className="bg-surface-hover border border-border/50 rounded-lg p-3"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs text-text truncate">
                      {r.strategy_name}
                    </span>
                    <ValidationBadge resultId={r.id} />
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    {r.ticker} • {r.interval} • {formatDate(r.created_at)}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className={`text-xs font-medium ${
                    r.total_return_pct >= 0 ? "text-success" : "text-danger"
                  }`}>
                    {formatPercent(r.total_return_pct)}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    승률 {r.win_rate.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div className="mt-2 flex gap-3 text-[10px] text-text-muted">
                <span>MDD: {r.max_drawdown_pct.toFixed(1)}%</span>
                <span>거래: {r.total_trades}회</span>
                <span>PF: {r.profit_factor.toFixed(2)}</span>
              </div>

              {/* Actions */}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => handleStartTrading(r.id, "paper")}
                  disabled={startingId === r.id}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20 disabled:opacity-50 transition-colors"
                >
                  {startingId === r.id && mode === "paper" ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Play size={10} />
                  )}
                  페이퍼 시작
                </button>
                <button
                  onClick={() => handleStartTrading(r.id, "live")}
                  disabled={startingId === r.id}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20 border border-success/20 disabled:opacity-50 transition-colors"
                >
                  {startingId === r.id && mode === "live" ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <TrendingUp size={10} />
                  )}
                  라이브 시작
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Check criteria info */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <div className="text-[10px] text-text-muted">
          <span className="font-medium">전환 조건:</span> 수익률 &gt; 0%, 승률 &gt; 50%, 최대낙폭 &lt; 10%, 거래횟수 &gt; 10회
        </div>
      </div>
    </div>
  );
}
