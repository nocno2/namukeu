import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Globe, Pin, PinOff, TrendingUp } from "lucide-react";
import { api, type BlogTraffic as BlogTrafficData } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

export function BlogTraffic({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [data, setData] = useState<BlogTrafficData | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setData(await api.blogTraffic());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (error || !data) return null;

  const maxTrend = Math.max(...data.daily_trend.map((d) => d.views), 1);

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
          <Globe size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">Blog</h3>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
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
        <div className="flex items-center gap-2 mt-2 text-[10px] text-text-muted">
          <span>Today</span>
          <span className="font-mono text-text">{data.today_views}</span>
          <span className="text-text-muted/30">•</span>
          <span>Total</span>
          <span className="font-mono text-text">{data.total_views.toLocaleString()}</span>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Stats */}
          <div className="flex gap-6">
            <div>
              <div className="text-2xl font-bold text-text">{data.today_views}</div>
              <div className="text-[10px] text-text-muted">오늘</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-text">{data.total_views.toLocaleString()}</div>
              <div className="text-[10px] text-text-muted">전체</div>
            </div>
          </div>

          {/* 7-day trend */}
          {data.daily_trend.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-2 flex items-center gap-1">
                <TrendingUp size={10} />
                7일 추이
              </div>
              <div className="flex items-end gap-1 h-10">
                {data.daily_trend.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full bg-primary/60 rounded-sm min-h-[2px]"
                      style={{ height: `${(d.views / maxTrend) * 100}%` }}
                    />
                    <span className="text-[8px] text-text-muted">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top posts */}
          {data.top_posts.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-1.5 flex items-center gap-1">
                <TrendingUp size={10} />
                인기 글
              </div>
              <div className="space-y-1">
                {data.top_posts.slice(0, 5).map((p, i) => (
                  <div key={p.slug} className="flex justify-between text-xs gap-2">
                    <span className="truncate text-text-muted">
                      <span className="text-text/60">{i + 1}.</span> {p.title}
                    </span>
                    <span className="font-mono shrink-0 text-text">{p.views}</span>
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
