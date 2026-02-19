import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { stocksApi } from '../api/client';
import { useNavigate } from 'react-router-dom';

interface StockItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  history: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }> | null;
}

const markets = [
  { label: '미국', value: 'US' },
  { label: 'KOSPI', value: 'KOSPI' },
  { label: 'KOSDAQ', value: 'KOSDAQ' },
];

export default function Stocks() {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState('US');
  const chartRefs = useRef<Map<string, { chart: IChartApi; series: ISeriesApi<'Candlestick'> }>>(new Map());

  useEffect(() => {
    fetchStocks();
  }, [market]);

  useEffect(() => {
    // Initialize charts after stocks are loaded
    const timer = setTimeout(() => {
      stocks.forEach((stock) => {
        if (stock.history && stock.history.length > 0) {
          initMiniChart(stock.symbol, stock.history);
        }
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [stocks]);

  useEffect(() => {
    return () => {
      // Cleanup charts on unmount
      chartRefs.current.forEach(({ chart }) => chart.remove());
      chartRefs.current.clear();
    };
  }, []);

  const fetchStocks = async () => {
    setLoading(true);
    try {
      const res = await stocksApi.getPopular(market, 20);
      setStocks(res.data);
    } catch (error) {
      console.error('Failed to fetch stocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const initMiniChart = (symbol: string, history: StockItem['history']) => {
    const containerId = `mini-chart-${symbol}`;
    const container = document.getElementById(containerId);
    if (!container || chartRefs.current.has(symbol)) return;

    const chart = createChart(container, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: 'transparent' },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      height: 50,
      width: 120,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    });

    const data: CandlestickData[] = history.map((item) => ({
      time: item.date.split('T')[0] as Time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    series.setData(data);
    chart.timeScale().fitContent();

    chartRefs.current.set(symbol, { chart, series });
  };

  const formatPrice = (num: number | null) => {
    if (num === null) return '-';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  const handleStockClick = (symbol: string) => {
    navigate(`/chart?symbol=${symbol}`);
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f0f6fc]">종목 목록</h1>
        <p className="text-sm text-[#8b949e] mt-1">인기 종목을 미니 차트와 함께 확인하세요</p>
      </div>

      {/* Market Tabs */}
      <div className="flex gap-2">
        {markets.map((m) => (
          <button
            key={m.value}
            onClick={() => setMarket(m.value)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              market === m.value
                ? 'bg-[#58a6ff] text-white'
                : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#30363d]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Stock List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
            <div className="text-[#8b949e]">Loading...</div>
          </div>
        </div>
      ) : (
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#21262d]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase">종목</th>
                  <th className="px-5 py-3"></th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">현재가</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">변동</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">등락률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {stocks.map((stock) => (
                  <tr
                    key={stock.symbol}
                    onClick={() => handleStockClick(stock.symbol)}
                    className="table-row cursor-pointer"
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-[#f0f6fc]">{stock.symbol}</div>
                      <div className="text-xs text-[#6e7681]">{stock.name}</div>
                    </td>
                    <td className="px-2 py-4">
                      <div
                        id={`mini-chart-${stock.symbol}`}
                        className="w-[120px] h-[50px]"
                      />
                    </td>
                    <td className="px-5 py-4 text-right text-[#f0f6fc] font-medium">
                      ${formatPrice(stock.price)}
                    </td>
                    <td className={`px-5 py-4 text-right font-medium ${(stock.change || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {stock.change !== null
                        ? `${stock.change >= 0 ? '+' : ''}${formatPrice(stock.change)}`
                        : '-'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={`badge ${(stock.change_pct || 0) >= 0 ? 'badge-success' : 'badge-danger'}`}>
                        {stock.change_pct !== null
                          ? `${stock.change_pct >= 0 ? '+' : ''}${formatPrice(stock.change_pct)}%`
                          : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
