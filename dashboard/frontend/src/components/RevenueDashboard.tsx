import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  Pin,
  PinOff,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface RevenueData {
  monthlyTarget: number;
  currentRevenue: number;
  currentCost: number;
  netIncome: number;
  targetProgress: number;
  monthlyData: { month: string; revenue: number; cost: number; profit: number }[];
  forecast: {
    projectedRevenue: number;
    projectedCost: number;
    projectedProfit: number;
    remainingDays: number;
    daysInMonth: number;
    today: number;
    methods: {
      method: string;
      label: string;
      projectedRevenue: number;
      projectedCost: number;
      projectedProfit: number;
    }[];
    bestMethod: string;
    trend: "up" | "down" | "stable";
    trendLabel: string;
  };
  bySource: { source: string; amount: number; percent: number }[];
  recentRecords: { date: string; amount: number; source: string }[];
  recentCosts: { date: string; amount: number; category: string }[];
}

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRefresh?: () => void;
}

// Fetch through dashboard backend proxy
async function fetchRevenueData(): Promise<RevenueData> {
  const res = await fetch("/api/proxy/tgbot/api/revenue/data");
  if (!res.ok) {
    throw new Error(`Failed to fetch revenue data: ${res.status}`);
  }
  return res.json();
}

export function RevenueDashboard({ collapsed, pinned, onToggleCollapse, onTogglePin, onRefresh }: Props) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchRevenueData();
      setData(result);
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
            <DollarSign size={16} className="text-danger" />
            <h3 className="font-semibold text-sm text-text">Revenue</h3>
          </div>
          <button onClick={fetchData} className="text-xs text-primary hover:underline">
            재시도
          </button>
        </div>
        <div className="text-xs text-danger">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { monthlyTarget, currentRevenue, currentCost, netIncome, targetProgress, monthlyData, forecast, bySource, recentRecords, recentCosts } = data;
  const isProfit = netIncome >= 0;

  // Calculate max for chart scaling
  const maxMonthly = Math.max(...monthlyData.map((d) => Math.max(d.revenue, d.cost, Math.abs(d.profit))), 1);

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
          <DollarSign size={16} className="text-success" />
          <h3 className="font-semibold text-sm text-text">Revenue</h3>
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
            <span className="font-mono text-text">₩{netIncome.toLocaleString()}</span>
          </span>
          {monthlyTarget > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-text-muted/30">•</span>
              <span>{targetProgress}%</span>
            </span>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Main Stats */}
          <div className="flex gap-6">
            <div>
              <div className={`text-2xl font-bold ${isProfit ? "text-success" : "text-danger"}`}>
                ₩{netIncome.toLocaleString()}
              </div>
              <div className="text-[10px] text-text-muted">이번 달 순수입</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-text">₩{currentRevenue.toLocaleString()}</div>
              <div className="text-[10px] text-text-muted">수익</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-text">₩{currentCost.toLocaleString()}</div>
              <div className="text-[10px] text-text-muted">비용</div>
            </div>
          </div>

          {/* Target Progress Bar */}
          {monthlyTarget > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                <span>월 목표</span>
                <span>
                  ₩{monthlyTarget.toLocaleString()} ({targetProgress}%)
                </span>
              </div>
              <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    targetProgress >= 100 ? "bg-success" : targetProgress >= 50 ? "bg-primary" : "bg-danger"
                  }`}
                  style={{ width: `${Math.min(targetProgress, 100)}%` }}
                />
              </div>
              {targetProgress < 100 && (
                <div className="text-[10px] text-text-muted mt-1">
                  목표까지 ₩{(monthlyTarget - netIncome).toLocaleString()} 남음
                </div>
              )}
              {targetProgress >= 100 && (
                <div className="text-[10px] text-success mt-1">목표 달성!</div>
              )}
            </div>
          )}

          {/* Monthly Chart */}
          {monthlyData.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-2 flex items-center gap-1">
                월별 추이 (최근 6개월)
              </div>
              <div className="flex items-end gap-1 h-16">
                {monthlyData.map((d) => (
                  <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex flex-col gap-0.5">
                      <div
                        className="w-full bg-success/60 rounded-sm min-h-[2px]"
                        style={{ height: `${(d.revenue / maxMonthly) * 100}%` }}
                      />
                      <div
                        className="w-full bg-danger/40 rounded-sm min-h-[2px]"
                        style={{ height: `${(d.cost / maxMonthly) * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-text-muted">{d.month.slice(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[8px] text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-success/60 rounded-sm" /> 수익
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-danger/40 rounded-sm" /> 비용
                </span>
              </div>
            </div>
          )}

          {/* Forecast */}
          <div className="bg-surface-hover rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-text-muted flex items-center gap-1">
                월말 예측 ({forecast.today}/{forecast.daysInMonth}일)
              </div>
              {forecast.trend && (
                <div className={`text-[10px] flex items-center gap-1 ${
                  forecast.trend === "up" ? "text-success" : forecast.trend === "down" ? "text-danger" : "text-text-muted"
                }`}>
                  {forecast.trend === "up" ? "↗" : forecast.trend === "down" ? "↘" : "→"} {forecast.trendLabel}
                </div>
              )}
            </div>
            <div className="flex gap-4 text-xs">
              <div>
                <span className="text-text-muted">예상 수익: </span>
                <span className="font-mono text-text">₩{forecast.projectedRevenue.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-text-muted">예상 순수입: </span>
                <span className={`font-mono ${forecast.projectedProfit >= 0 ? "text-success" : "text-danger"}`}>
                  ₩{forecast.projectedProfit.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Forecast methods comparison */}
            {forecast.methods && forecast.methods.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/30">
                <div className="text-[9px] text-text-muted mb-1">예측 방법별 순수입:</div>
                <div className="flex gap-2 text-[10px]">
                  {forecast.methods.map((m) => (
                    <div
                      key={m.method}
                      className={`flex-1 p-1.5 rounded ${
                        m.method === forecast.bestMethod ? "bg-primary/10 border border-primary/30" : "bg-surface/50"
                      }`}
                    >
                      <div className="text-[8px] text-text-muted">{m.label}</div>
                      <div className={`font-mono ${m.projectedProfit >= 0 ? "text-success" : "text-danger"}`}>
                        ₩{m.projectedProfit.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {monthlyTarget > 0 && (
              <div className="text-[10px] text-text-muted mt-1">
                {forecast.projectedProfit >= monthlyTarget
                  ? `목표 달성 예상 (${Math.round((forecast.projectedProfit / monthlyTarget) * 100)}%)`
                  : `남은 ${forecast.remainingDays}일에 하루 ₩{Math.ceil((monthlyTarget - forecast.projectedProfit) / forecast.remainingDays).toLocaleString()}씩 필요`}
              </div>
            )}
          </div>

          {/* Recent Records */}
          <div className="grid grid-cols-2 gap-3">
            {recentRecords.length > 0 && (
              <div>
                <div className="text-[10px] text-text-muted mb-1">최근 수익</div>
                <div className="space-y-1">
                  {recentRecords.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-text-muted truncate">{r.source}</span>
                      <span className="font-mono text-success">+₩{r.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentCosts.length > 0 && (
              <div>
                <div className="text-[10px] text-text-muted mb-1">최근 비용</div>
                <div className="space-y-1">
                  {recentCosts.map((c, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-text-muted truncate">{c.category}</span>
                      <span className="font-mono text-danger">-₩{c.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* By Source Analysis */}
          {bySource && bySource.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-2 flex items-center gap-1">
                수익 원별 (최근 6개월)
              </div>
              <div className="space-y-1.5">
                {bySource.map((s) => (
                  <div key={s.source} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(s.percent, 5)}%` }}
                      />
                      <span className="text-[10px] text-text truncate w-12">{s.source}</span>
                    </div>
                    <span className="text-[10px] font-mono text-text-muted w-16 text-right">
                      ₩{s.amount.toLocaleString()}
                    </span>
                    <span className="text-[9px] text-text-muted/60 w-8 text-right">
                      {s.percent}%
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
