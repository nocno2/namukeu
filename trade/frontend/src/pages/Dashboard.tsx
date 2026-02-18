import { useEffect, useState } from 'react';
import { tradingApi, newsApi, watchlistApi } from '../api/client';

interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  items: PortfolioItem[];
}

interface PortfolioItem {
  symbol: string;
  name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  published_at: string;
}

interface WatchlistItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
}

function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}

function formatPrice(num: number): string {
  return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [portfolioRes, newsRes, watchlistRes] = await Promise.all([
          tradingApi.getPortfolio().catch(() => ({ data: null })),
          newsApi.fetch(undefined, '주식 시장').then((r) => r.data.news.slice(0, 5)),
          watchlistApi.list().then((r) => {
            if (r.data.length > 0) return r.data[0].items.slice(0, 5);
            return [];
          }),
        ]);

        setPortfolio(portfolioRes.data);
        setNews(newsRes);
        setWatchlist(watchlistRes);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-[--text-secondary]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">총 자산</div>
          <div className="text-2xl font-bold mt-1">
            ₩{formatNumber(portfolio?.total_value || 0)}
          </div>
        </div>
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">총 비용</div>
          <div className="text-2xl font-bold mt-1">
            ₩{formatNumber(portfolio?.total_cost || 0)}
          </div>
        </div>
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">총 손익</div>
          <div
            className={`text-2xl font-bold mt-1 ${
              (portfolio?.total_pnl || 0) >= 0 ? 'positive' : 'negative'
            }`}
          >
            {portfolio?.total_pnl && portfolio.total_pnl >= 0 ? '+' : ''}
            ₩{formatNumber(portfolio?.total_pnl || 0)}
          </div>
        </div>
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">수익률</div>
          <div
            className={`text-2xl font-bold mt-1 ${
              (portfolio?.total_pnl_pct || 0) >= 0 ? 'positive' : 'negative'
            }`}
          >
            {portfolio?.total_pnl_pct && portfolio.total_pnl_pct >= 0 ? '+' : ''}
            {formatPrice(portfolio?.total_pnl_pct || 0)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Watchlist */}
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <h2 className="text-lg font-semibold mb-4">관심종목</h2>
          {watchlist.length > 0 ? (
            <div className="space-y-2">
              {watchlist.map((item) => (
                <div
                  key={item.symbol}
                  className="flex justify-between items-center p-2 hover:bg-[--bg-secondary] rounded"
                >
                  <div>
                    <div className="font-medium">{item.symbol}</div>
                    <div className="text-xs text-[--text-secondary]">
                      {item.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      ${item.price ? formatPrice(item.price) : '-'}
                    </div>
                    <div
                      className={`text-xs ${
                        (item.change_pct || 0) >= 0 ? 'positive' : 'negative'
                      }`}
                    >
                      {item.change_pct !== null
                        ? `${item.change_pct >= 0 ? '+' : ''}${formatPrice(
                            item.change_pct
                          )}%`
                        : '-'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[--text-secondary] text-sm">
              관심종목이 없습니다
            </p>
          )}
        </div>

        {/* News */}
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <h2 className="text-lg font-semibold mb-4">最新 뉴스</h2>
          {news.length > 0 ? (
            <div className="space-y-3">
              {news.map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:bg-[--bg-secondary] p-2 rounded transition-colors"
                >
                  <div className="text-sm font-medium line-clamp-2">
                    {item.title}
                  </div>
                  <div className="text-xs text-[--text-secondary] mt-1">
                    {item.source}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-[--text-secondary] text-sm">뉴스가 없습니다</p>
          )}
        </div>
      </div>

      {/* Holdings */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <h2 className="text-lg font-semibold mb-4">보유종목</h2>
        {portfolio?.items && portfolio.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[--text-secondary] border-b border-[--border]">
                  <th className="pb-2">종목</th>
                  <th className="pb-2 text-right">수량</th>
                  <th className="pb-2 text-right">평균가</th>
                  <th className="pb-2 text-right">현재가</th>
                  <th className="pb-2 text-right">평가금액</th>
                  <th className="pb-2 text-right">손익</th>
                  <th className="pb-2 text-right">수익률</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.items.map((item) => (
                  <tr
                    key={item.symbol}
                    className="border-b border-[--border]/50 hover:bg-[--bg-secondary]"
                  >
                    <td className="py-2">
                      <div className="font-medium">{item.symbol}</div>
                      <div className="text-xs text-[--text-secondary]">
                        {item.name}
                      </div>
                    </td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">
                      ${formatPrice(item.avg_price)}
                    </td>
                    <td className="py-2 text-right">
                      ${formatPrice(item.current_price)}
                    </td>
                    <td className="py-2 text-right">
                      ${formatPrice(item.market_value)}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        item.unrealized_pnl >= 0 ? 'positive' : 'negative'
                      }`}
                    >
                      {item.unrealized_pnl >= 0 ? '+' : ''}$
                      {formatPrice(item.unrealized_pnl)}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        item.unrealized_pnl_pct >= 0 ? 'positive' : 'negative'
                      }`}
                    >
                      {item.unrealized_pnl_pct >= 0 ? '+' : ''}
                      {formatPrice(item.unrealized_pnl_pct)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[--text-secondary] text-sm">
            보유종목이 없습니다
          </p>
        )}
      </div>
    </div>
  );
}
