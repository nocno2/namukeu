import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { stocksApi } from '../api/client';
import { useNavigate } from 'react-router-dom';

interface StockItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
}

const markets = [
  { label: '미국', value: 'US' },
  { label: 'KOSPI', value: 'KOSPI' },
  { label: 'KOSDAQ', value: 'KOSDAQ' },
];

// Fallback popular stocks when API fails
const fallbackStocks: Record<string, StockItem[]> = {
  US: [
    { symbol: 'AAPL', name: 'Apple Inc.', price: null, change: null, change_pct: null },
    { symbol: 'MSFT', name: 'Microsoft Corp.', price: null, change: null, change_pct: null },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: null, change: null, change_pct: null },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', price: null, change: null, change_pct: null },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', price: null, change: null, change_pct: null },
    { symbol: 'META', name: 'Meta Platforms', price: null, change: null, change_pct: null },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: null, change: null, change_pct: null },
    { symbol: 'BRK-B', name: 'Berkshire Hathaway', price: null, change: null, change_pct: null },
  ],
  KOSPI: [
    { symbol: '005930', name: '삼성전자', price: null, change: null, change_pct: null },
    { symbol: '000660', name: 'SK하이닉스', price: null, change: null, change_pct: null },
    { symbol: '035420', name: 'NAVER', price: null, change: null, change_pct: null },
    { symbol: '207940', name: '삼성바이오로직스', price: null, change: null, change_pct: null },
    { symbol: '068270', name: '셀트리온', price: null, change: null, change_pct: null },
  ],
  KOSDAQ: [
    { symbol: '035720', name: '카카오', price: null, change: null, change_pct: null },
    { symbol: '095340', name: '카카오게임즈', price: null, change: null, change_pct: null },
    { symbol: '066410', name: '아프리카TV', price: null, change: null, change_pct: null },
  ],
};

export default function Stocks() {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState('US');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStocks();
  }, [market]);

  const fetchStocks = async () => {
    setLoading(true);
    setError('');

    try {
      // Try to fetch from API
      const res = await stocksApi.getPopular(market, 10);
      if (res.data && res.data.length > 0) {
        setStocks(res.data);
      } else {
        // Use fallback if empty
        setStocks(fallbackStocks[market] || fallbackStocks.US);
      }
    } catch (err) {
      console.error('Failed to fetch stocks:', err);
      // Use fallback on error
      setStocks(fallbackStocks[market] || fallbackStocks.US);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (num: number | null) => {
    if (num === null) return '-';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  const handleStockClick = (symbol: string) => {
    navigate(`/chart?symbol=${symbol}`);
  };

  return (
    <div className="p-4 lg:p-8 space-y-4 lg:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-[#f0f6fc]">종목 목록</h1>
        <p className="text-sm text-[#8b949e] mt-1">인기 종목을 확인하세요</p>
      </div>

      {/* Market Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {markets.map((m) => (
          <button
            key={m.value}
            onClick={() => setMarket(m.value)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              market === m.value
                ? 'bg-[#58a6ff] text-white'
                : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]'
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
          <div className="divide-y divide-[#21262d]">
            {stocks.map((stock) => (
              <div
                key={stock.symbol}
                onClick={() => handleStockClick(stock.symbol)}
                className="p-4 hover:bg-[#21262d] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#21262d] flex items-center justify-center text-[#58a6ff] font-bold text-sm">
                      {stock.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-[#f0f6fc]">{stock.symbol}</div>
                      <div className="text-xs text-[#6e7681]">{stock.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-[#f0f6fc]">
                      {stock.price !== null ? `$${formatPrice(stock.price)}` : '-'}
                    </div>
                    <div className={`text-xs ${(stock.change_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {stock.change_pct !== null
                        ? `${stock.change_pct >= 0 ? '+' : ''}${formatPrice(stock.change_pct)}%`
                        : '---'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
