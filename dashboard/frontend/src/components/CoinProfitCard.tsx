import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Coins,
  Pin,
  PinOff,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api, type CoinPnLData, type CoinStatsData } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRefresh?: () => void;
}

export function CoinProfitCard({ collapsed, pinned, onToggleCollapse, onTogglePin, onRefresh }: Props) {
  const [stats, setStats] = useState<CoinStatsData | null>(null);
  const [pnl, setPnl] = useState<CoinPnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [statsData, pnlData] = await Promise.all([
        api.coinStats(),
        api.coinPnL(1000000),
      ]);
      setStats(statsData);
      setPnl(pnlData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
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
            <Coins size={16} className="text-danger" />
            <h3 className="font-semibold text-sm text-text">COIN 수익</h3>
          </div>
          <button onClick={fetchData} className="text-xs text-primary hover:underline">
            재시도
          </button>
        </div>
        <div className="text-xs text-danger">{error}</div>
      </div>
    );
  }

  if (!stats || !pnl) return null;

  const isProfit = pnl.total_pnl >= 0;

  return (
    <div
      className={`bg-surface border border-border rounded-2xl transition-all card-glow card-transition ${
        pinned ? "border-primary/50" : "border-border/60"
      } ${collapsed ? "p-3" : "p-5"}`}
      style={{ animation: "slideUp 0.3s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins size={16} className={isProfit ? "text-success" : "text-danger"} />
          <h3 className="font-semibold text-sm text-text">COIN 수익</h3>
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
        <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            {isProfit ? <TrendingUp size={10} className="text-success" /> : <TrendingDown size={10} className="text-danger" />}
            <span className="font-mono text-text">₩{pnl.total_pnl.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-text-muted/30">•</span>
            <span>{pnl.total_pnl_pct.toFixed(2)}%</span>
          </span>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Main Stats */}
          <div className="flex gap-6">
            <div>
              <div className={`text-2xl font-bold ${isProfit ? "text-success" : "text-danger"}`}>
                ₩{pnl.total_pnl.toLocaleString()}
              </div>
              <div className="text-[10px] text-text-muted">총 수익</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-text">
                {pnl.total_pnl_pct >= 0 ? "+" : ""}{pnl.total_pnl_pct.toFixed(2)}%
              </div>
              <div className="text-[10px] text-text-muted">수익률</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-text">₩{(pnl.final_capital / 10000).toFixed(0)}만</div>
              <div className="text-[10px] text-text-muted">현재 자본</div>
            </div>
          </div>

          {/* Win Rate & Trades */}
          <div className="flex gap-4">
            <div className="flex-1 bg-surface-hover rounded-lg p-3">
              <div className="text-[10px] text-text-muted mb-1">승률</div>
              <div className={`text-lg font-bold ${stats.win_rate >= 50 ? "text-success" : "text-danger"}`}>
                {stats.win_rate.toFixed(1)}%
              </div>
              <div className="text-[8px] text-text-muted">
                {stats.winning_trades}승 / {stats.losing_trades}패
              </div>
            </div>
            <div className="flex-1 bg-surface-hover rounded-lg p-3">
              <div className="text-[10px] text-text-muted mb-1">거래 횟수</div>
              <div className="text-lg font-bold text-text">
                {stats.completed_trades}
              </div>
              <div className="text-[8px] text-text-muted">
                완료된 거래
              </div>
            </div>
          </div>

          {/* Profit Factor */}
          <div className="bg-surface-hover rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-text-muted">Profit Factor</div>
              <div className={`text-sm font-bold ${stats.profit_factor >= 1.5 ? "text-success" : stats.profit_factor >= 1 ? "text-warning" : "text-danger"}`}>
                {stats.profit_factor.toFixed(2)}
              </div>
            </div>
            <div className="flex gap-3 text-[10px] text-text-muted">
              <span>수익: <span className="text-success">₩{stats.gross_profit.toLocaleString()}</span></span>
              <span>손실: <span className="text-danger">₩{Math.abs(stats.gross_loss).toLocaleString()}</span></span>
            </div>
          </div>

          {/* Max Drawdown */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">최대 낙폭</span>
            <span className={`font-mono ${stats.max_drawdown_pct > 10 ? "text-danger" : stats.max_drawdown_pct > 5 ? "text-warning" : "text-success"}`}>
              -{stats.max_drawdown_pct.toFixed(2)}%
            </span>
          </div>

          {/* Recent Trades */}
          {pnl.trades && pnl.trades.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-2">최근 거래</div>
              <div className="space-y-1">
                {pnl.trades.slice(0, 5).map((trade, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted">{trade.ticker}</span>
                      <span className={`px-1 py-0.5 rounded text-[8px] ${trade.side === "long" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                        {trade.side}
                      </span>
                    </div>
                    <span className={`font-mono ${trade.pnl >= 0 ? "text-success" : "text-danger"}`}>
                      {trade.pnl >= 0 ? "+" : ""}₩{trade.pnl.toLocaleString()}
                    </span>
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
