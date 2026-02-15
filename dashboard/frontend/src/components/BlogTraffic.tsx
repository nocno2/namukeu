import { useCallback, useEffect, useState } from "react";
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
    <div className={`bg-surface border rounded-xl ${pinned ? "border-primary/40" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Blog</h3>
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
          <span className="text-text-muted">Today</span>
          <span className="font-mono">{data.today_views}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">Total</span>
          <span className="font-mono">{data.total_views.toLocaleString()}</span>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Stats */}
          <div className="flex gap-4">
            <div>
              <div className="text-2xl font-bold">{data.today_views}</div>
              <div className="text-[10px] text-text-muted">오늘</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{data.total_views.toLocaleString()}</div>
              <div className="text-[10px] text-text-muted">전체</div>
            </div>
          </div>

          {/* 7-day trend */}
          {data.daily_trend.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-2">7일 추이</div>
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
              <div className="text-[10px] text-text-muted mb-1.5">인기 글</div>
              <div className="space-y-1">
                {data.top_posts.slice(0, 5).map((p, i) => (
                  <div key={p.slug} className="flex justify-between text-xs gap-2">
                    <span className="truncate text-text-muted">
                      <span className="text-text/60">{i + 1}.</span> {p.title}
                    </span>
                    <span className="font-mono shrink-0">{p.views}</span>
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
