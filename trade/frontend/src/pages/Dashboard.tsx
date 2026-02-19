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
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
          <div className="text-[#8b949e]">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">대시보드</h1>
          <p className="text-sm text-[#8b949e] mt-1">포트폴리오 현황을 확인하세요</p>
        </div>
        <div className="text-sm text-[#6e7681]">
          {new Date().toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Value */}
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">총 자산</span>
            <div className="w-8 h-8 rounded-lg bg-[#21262d] flex items-center justify-center text-[#58a6ff]">💰</div>
          </div>
          <div className="text-2xl font-bold text-[#f0f6fc]">
            ${formatNumber(portfolio?.total_value || 0)}
          </div>
          <div className="text-xs text-[#6e7681] mt-1">평가금액</div>
        </div>

        {/* Total Cost */}
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">총 투자금</span>
            <div className="w-8 h-8 rounded-lg bg-[#21262d] flex items-center justify-center text-[#a371f7]">📊</div>
          </div>
          <div className="text-2xl font-bold text-[#f0f6fc]">
            ${formatNumber(portfolio?.total_cost || 0)}
          </div>
          <div className="text-xs text-[#6e7681] mt-1">투자원금</div>
        </div>

        {/* Total PnL */}
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">총 손익</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(portfolio?.total_pnl || 0) >= 0 ? 'bg-[#3fb950]/10 text-[#3fb950]' : 'bg-[#f85149]/10 text-[#f85149]'}`}>
              {(portfolio?.total_pnl || 0) >= 0 ? '↑' : '↓'}
            </div>
          </div>
          <div className={`text-2xl font-bold ${(portfolio?.total_pnl || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl || 0) >= 0 ? '+' : ''}${formatNumber(portfolio?.total_pnl || 0)}
          </div>
          <div className={`text-xs ${(portfolio?.total_pnl || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl || 0) >= 0 ? '+' : ''}{formatNumber(portfolio?.total_pnl || 0)} KRW
          </div>
        </div>

        {/* Return % */}
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">수익률</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(portfolio?.total_pnl_pct || 0) >= 0 ? 'bg-[#3fb950]/10 text-[#3fb950]' : 'bg-[#f85149]/10 text-[#f85149]'}`}>
              %
            </div>
          </div>
          <div className={`text-2xl font-bold ${(portfolio?.total_pnl_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl_pct || 0) >= 0 ? '+' : ''}{formatPrice(portfolio?.total_pnl_pct || 0)}%
          </div>
          <div className="text-xs text-[#6e7681] mt-1">전체 수익률</div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Watchlist */}
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
          <div className="p-5 border-b border-[#30363d] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#f0f6fc]">관심종목</h2>
            <span className="badge badge-info">{watchlist.length}개</span>
          </div>
          <div className="divide-y divide-[#21262d]">
            {watchlist.length > 0 ? (
              watchlist.map((item) => (
                <div key={item.symbol} className="p-4 hover:bg-[#21262d] transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#f0f6fc]">{item.symbol}</div>
                      <div className="text-xs text-[#6e7681]">{item.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-[#f0f6fc]">
                        ${item.price ? formatPrice(item.price) : '-'}
                      </div>
                      <div className={`text-sm font-medium ${(item.change_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                        {(item.change_pct || 0) >= 0 ? '+' : ''}{item.change_pct !== null ? formatPrice(item.change_pct) : '-'}%
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[#6e7681]">
                관심종목이 없습니다
              </div>
            )}
          </div>
        </div>

        {/* News */}
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
          <div className="p-5 border-b border-[#30363d] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#f0f6fc]">최신 뉴스</h2>
            <span className="badge badge-info">{news.length}개</span>
          </div>
          <div className="divide-y divide-[#21262d]">
            {news.length > 0 ? (
              news.map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 hover:bg-[#21262d] transition-colors"
                >
                  <div className="text-sm font-medium text-[#f0f6fc] line-clamp-2">
                    {item.title}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-[#58a6ff]">{item.source}</span>
                    <span className="text-xs text-[#6e7681]">•</span>
                    <span className="text-xs text-[#6e7681]">
                      {new Date(item.published_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </a>
              ))
            ) : (
              <div className="p-8 text-center text-[#6e7681]">
                뉴스가 없습니다
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        <div className="p-5 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#f0f6fc]">보유종목</h2>
        </div>
        {portfolio?.items && portfolio.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#21262d]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">종목</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">수량</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">평균가</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">현재가</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">평가금액</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">손익</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {portfolio.items.map((item) => (
                  <tr key={item.symbol} className="table-row">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-[#f0f6fc]">{item.symbol}</div>
                      <div className="text-xs text-[#6e7681]">{item.name}</div>
                    </td>
                    <td className="px-5 py-4 text-right text-[#f0f6fc]">{item.quantity}</td>
                    <td className="px-5 py-4 text-right text-[#f0f6fc]">${formatPrice(item.avg_price)}</td>
                    <td className="px-5 py-4 text-right text-[#f0f6fc]">${formatPrice(item.current_price)}</td>
                    <td className="px-5 py-4 text-right text-[#f0f6fc]">${formatNumber(item.market_value)}</td>
                    <td className={`px-5 py-4 text-right font-medium ${item.unrealized_pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {item.unrealized_pnl >= 0 ? '+' : ''}${formatNumber(item.unrealized_pnl)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={`badge ${item.unrealized_pnl_pct >= 0 ? 'badge-success' : 'badge-danger'}`}>
                        {item.unrealized_pnl_pct >= 0 ? '+' : ''}{formatPrice(item.unrealized_pnl_pct)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📈</div>
            <div className="text-[#8b949e]">보유종목이 없습니다</div>
            <div className="text-sm text-[#6e7681] mt-1">주문을 통해 종목을 구매하세요</div>
          </div>
        )}
      </div>
    </div>
  );
}
