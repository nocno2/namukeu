import { useEffect, useState, useRef } from 'react';
import { stocksApi } from '../api/client';
import { useNavigate } from 'react-router-dom';

interface StockItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  volume?: number;
  market_cap?: number;
  rank?: number;
}

const markets = [
  { label: '미국', value: 'US' },
  { label: 'KOSPI', value: 'KOSPI' },
  { label: 'KOSDAQ', value: 'KOSDAQ' },
];

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
  ],
  KOSDAQ: [
    { symbol: '035720', name: '카카오', price: null, change: null, change_pct: null },
    { symbol: '095340', name: '카카오게임즈', price: null, change: null, change_pct: null },
  ],
};

// Mini line chart
function MiniChart({ symbol, width = 100, height = 32 }: { symbol: string; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#21262d';
    ctx.fillRect(0, 0, width, height);

    stocksApi.getHistory(symbol, '1mo')
      .then((res) => {
        const data = res.data;
        if (data.length < 2) return;

        const prices = data.map((d: any) => d.close);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || 1;

        const isUp = prices[prices.length - 1] >= prices[0];
        const lineColor = isUp ? '#3fb950' : '#f85149';

        ctx.fillStyle = 'transparent';
        ctx.clearRect(0, 0, width, height);

        // Line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        prices.forEach((price: number, i: number) => {
          const x = (i / (prices.length - 1)) * width;
          const y = height - ((price - minPrice) / priceRange) * (height - 4) - 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      })
      .catch(() => {});
  }, [symbol, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}

export default function Stocks() {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState('US');

  useEffect(() => {
    fetchStocks();
  }, [market]);

  const fetchStocks = async () => {
    setLoading(true);
    try {
      const res = await stocksApi.getPopular(market, 20);
      if (res.data && res.data.length > 0) {
        // Add rank
        const stocksWithRank = res.data.map((s: StockItem, idx: number) => ({
          ...s,
          rank: idx + 1,
        }));
        setStocks(stocksWithRank);
      } else {
        setStocks(fallbackStocks[market]?.map((s, i) => ({ ...s, rank: i + 1 })) || []);
      }
    } catch (err) {
      setStocks(fallbackStocks[market]?.map((s, i) => ({ ...s, rank: i + 1 })) || []);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (num: number | null | undefined) => {
    if (num === null || num === undefined) return '-';
    if (num >= 1000) return num.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  const formatVolume = (num: number | null | undefined) => {
    if (num === null || num === undefined) return '-';
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[#f0f6fc]">종목 목록</h1>
          <p className="text-sm text-[#8b949e] mt-1">순위 / 시가총액 / 등락률</p>
        </div>
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

      {/* Table Header */}
      <div className="bg-[#161b22] rounded-t-xl border border-[#30363d] border-b-0">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-[#6e7681] font-medium">
          <div className="col-span-1">순위</div>
          <div className="col-span-3">종목</div>
          <div className="col-span-2 text-right">가격</div>
          <div className="col-span-2 text-right">등락률</div>
          <div className="col-span-3 text-center">차트</div>
          <div className="col-span-1 text-right">거래량</div>
        </div>
      </div>

      {/* Stock List */}
      <div className="bg-[#161b22] rounded-b-xl border border-[#30363d] border-t-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="divide-y divide-[#21262d]">
            {stocks.map((stock) => (
              <div
                key={stock.symbol}
                onClick={() => navigate(`/chart?symbol=${stock.symbol}`)}
                className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-[#21262d] transition-colors cursor-pointer items-center"
              >
                {/* Rank */}
                <div className="col-span-1">
                  <span className={`text-sm font-bold ${(stock.rank ?? 0) <= 3 ? 'text-[#58a6ff]' : 'text-[#6e7681]'}`}>
                    {stock.rank ?? '-'}
                  </span>
                </div>

                {/* Symbol & Name */}
                <div className="col-span-3">
                  <div className="font-semibold text-[#f0f6fc]">{stock.symbol}</div>
                  <div className="text-xs text-[#6e7681] truncate">{stock.name}</div>
                </div>

                {/* Price */}
                <div className="col-span-2 text-right">
                  <div className="font-semibold text-[#f0f6fc]">
                    {market === 'US' ? '$' : '₩'}{formatPrice(stock.price)}
                  </div>
                </div>

                {/* Change % */}
                <div className="col-span-2 text-right">
                  <div className={`font-semibold ${(stock.change_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {(stock.change_pct || 0) >= 0 ? '+' : ''}{formatPrice(stock.change_pct)}%
                  </div>
                </div>

                {/* Mini Chart */}
                <div className="col-span-3 flex justify-center">
                  <MiniChart symbol={stock.symbol} width={80} height={28} />
                </div>

                {/* Volume */}
                <div className="col-span-1 text-right">
                  <div className="text-xs text-[#6e7681]">{formatVolume(stock.volume)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
