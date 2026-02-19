import { useEffect, useState, useRef } from 'react';
import { createChart, LineSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useNavigate } from 'react-router-dom';
import { stocksApi, tradingApi, newsApi } from '../api/client';

// Mini Chart Component
function MiniChart({ symbol, period = '1mo', width = 80, height = 32 }: { symbol: string; period?: string; width?: number; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#6e7681' },
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      height,
      width,
    });

    const series = chart.addSeries(LineSeries, {
      color: '#58a6ff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;

    stocksApi.getHistory(symbol, period)
      .then((res) => {
        const data = res.data.map((item: any) => ({
          time: item.date.split('T')[0] as Time,
          value: item.close,
        }));
        series.setData(data);
        chart.timeScale().fitContent();
      })
      .catch(console.error);

    return () => { chart.remove(); };
  }, [symbol, period, width, height]);

  return <div ref={containerRef} />;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [marketOverview, setMarketOverview] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overviewRes, portfolioRes, newsRes] = await Promise.all([
        stocksApi.getPopular('US', 5),
        tradingApi.getPortfolio().catch(() => ({ data: null })),
        newsApi.fetch(undefined, '주식 시장').then((r) => r.data.news.slice(0, 3)),
      ]);

      setMarketOverview(overviewRes.data);
      setPortfolio(portfolioRes.data);
      setNews(newsRes);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (num: number) => num?.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) || '0';
  const formatPrice = (num: number | null) => (num === null ? '-' : num.toLocaleString('ko-KR', { maximumFractionDigits: 2 }));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d1117]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
          <div className="text-[#8b949e]">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#0d1117] p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">
            TRADE<span className="text-[#58a6ff]">Pro</span>
          </h1>
          <p className="text-sm text-[#8b949e]">주식 거래 플랫폼</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/stocks')} className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded-lg hover:text-[#f0f6fc] transition-colors">
            📊 종목
          </button>
          <button onClick={() => navigate('/chart?symbol=AAPL')} className="px-4 py-2 bg-[#58a6ff] text-white rounded-lg hover:bg-[#58a6ff]/90 transition-colors">
            🕯 차트
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
          <div className="text-xs text-[#8b949e] mb-1">총 자산</div>
          <div className="text-xl font-bold text-[#f0f6fc]">${formatMoney(portfolio?.total_value || 0)}</div>
        </div>
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
          <div className="text-xs text-[#8b949e] mb-1">총 손익</div>
          <div className={`text-xl font-bold ${(portfolio?.total_pnl || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl || 0) >= 0 ? '+' : ''}${formatMoney(portfolio?.total_pnl || 0)}
          </div>
        </div>
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
          <div className="text-xs text-[#8b949e] mb-1">수익률</div>
          <div className={`text-xl font-bold ${(portfolio?.total_pnl_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl_pct || 0) >= 0 ? '+' : ''}{formatPrice(portfolio?.total_pnl_pct || 0)}%
          </div>
        </div>
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
          <div className="text-xs text-[#8b949e] mb-1">보유 종목</div>
          <div className="text-xl font-bold text-[#f0f6fc]">{portfolio?.items?.length || 0}</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Market Overview - Left 2/3 */}
        <div className="lg:col-span-2 bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
          <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#f0f6fc]">인기 종목</h2>
            <button onClick={() => navigate('/stocks')} className="text-xs text-[#58a6ff] hover:underline">더보기 →</button>
          </div>
          <div className="divide-y divide-[#21262d]">
            {marketOverview.map((stock: any) => (
              <div key={stock.symbol} onClick={() => navigate(`/chart?symbol=${stock.symbol}`)} className="p-4 hover:bg-[#21262d] transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#21262d] flex items-center justify-center text-[#58a6ff] font-bold text-sm">{stock.symbol.slice(0, 2)}</div>
                    <div>
                      <div className="font-semibold text-[#f0f6fc]">{stock.symbol}</div>
                      <div className="text-xs text-[#6e7681]">{stock.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <MiniChart symbol={stock.symbol} width={80} height={32} />
                    <div className="text-right min-w-[80px]">
                      <div className="font-semibold text-[#f0f6fc]">${formatPrice(stock.price)}</div>
                      <div className={`text-xs ${(stock.change_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                        {(stock.change_pct || 0) >= 0 ? '+' : ''}{formatPrice(stock.change_pct)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Quick Trading */}
          <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
            <h2 className="text-lg font-semibold text-[#f0f6fc] mb-3">빠른 주문</h2>
            <div className="space-y-1">
              {['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA'].map((symbol) => (
                <div key={symbol} className="flex items-center justify-between p-2 rounded-lg hover:bg-[#21262d] transition-colors">
                  <button onClick={() => navigate(`/chart?symbol=${symbol}`)} className="text-[#f0f6fc] font-medium">{symbol}</button>
                  <div className="flex gap-1">
                    <button onClick={() => navigate(`/trading?symbol=${symbol}&side=BUY`)} className="px-2 py-1 bg-[#3fb950]/20 text-[#3fb950] rounded text-xs font-medium hover:bg-[#3fb950]/30">매수</button>
                    <button onClick={() => navigate(`/trading?symbol=${symbol}&side=SELL`)} className="px-2 py-1 bg-[#f85149]/20 text-[#f85149] rounded text-xs font-medium hover:bg-[#f85149]/30">매도</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Portfolio */}
          <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#f0f6fc]">포트폴리오</h2>
              <button onClick={() => navigate('/portfolio')} className="text-xs text-[#58a6ff] hover:underline">보기 →</button>
            </div>
            {portfolio?.items?.length > 0 ? (
              <div className="space-y-2">
                {portfolio.items.slice(0, 4).map((item: any) => (
                  <div key={item.symbol} onClick={() => navigate(`/chart?symbol=${item.symbol}`)} className="flex items-center justify-between p-2 rounded-lg hover:bg-[#21262d] cursor-pointer">
                    <div>
                      <div className="font-medium text-[#f0f6fc]">{item.symbol}</div>
                      <div className="text-xs text-[#6e7681]">{item.quantity}주</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-[#f0f6fc]">${formatMoney(item.market_value)}</div>
                      <div className={`text-xs ${item.unrealized_pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                        {item.unrealized_pnl >= 0 ? '+' : ''}{formatPrice(item.unrealized_pnl_pct)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-[#6e7681]">
                <div className="text-2xl mb-1">📈</div>
                <div className="text-sm">보유종목 없음</div>
              </div>
            )}
          </div>

          {/* News */}
          <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#f0f6fc]">뉴스</h2>
              <button onClick={() => navigate('/news')} className="text-xs text-[#58a6ff] hover:underline">더보기 →</button>
            </div>
            <div className="space-y-2">
              {news.map((item: any, idx: number) => (
                <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer" className="block p-2 rounded-lg hover:bg-[#21262d] transition-colors">
                  <div className="text-sm text-[#f0f6fc] line-clamp-2">{item.title}</div>
                  <div className="text-xs text-[#6e7681] mt-1">{item.source}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
