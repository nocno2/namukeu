import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { stocksApi } from '../api/client';

const periods = [
  { label: '1D', value: '1d' },
  { label: '5D', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '5Y', value: '5y' },
];

export default function Chart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [symbol, setSymbol] = useState('AAPL');
  const [searchInput, setSearchInput] = useState('AAPL');
  const [price, setPrice] = useState<any>(null);
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#22303c' },
        textColor: '#8899a6',
      },
      grid: {
        vertLines: { color: '#38444d' },
        horzLines: { color: '#38444d' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#38444d',
      },
      timeScale: {
        borderColor: '#38444d',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ba7c',
      downColor: '#f4212e',
      borderUpColor: '#00ba7c',
      borderDownColor: '#f4212e',
      wickUpColor: '#00ba7c',
      wickDownColor: '#f4212e',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  const fetchData = async (sym: string, periodValue: string) => {
    setLoading(true);
    setError('');

    try {
      // Get price
      const priceRes = await stocksApi.getPrice(sym);
      setPrice(priceRes.data);

      // Get history
      const historyRes = await stocksApi.getHistory(sym, periodValue);
      const data: CandlestickData[] = historyRes.data.map(
        (item: { date: string; open: number; high: number; low: number; close: number }) => ({
          time: item.date.split('T')[0] as Time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        })
      );

      candlestickSeriesRef.current?.setData(data);
      chartRef.current?.timeScale().fitContent();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSymbol(searchInput.toUpperCase().trim());
      fetchData(searchInput.toUpperCase().trim(), period);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData(symbol, period);
  }, []);

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    fetchData(symbol, p);
  };

  const formatPrice = (num: number | undefined) => {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {symbol}
            {price?.name && (
              <span className="text-sm font-normal text-[--text-secondary]">
                {price.name}
              </span>
            )}
          </h1>
          {price && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-3xl font-bold">
                ${formatPrice(price.price)}
              </span>
              {price.change_pct !== undefined && (
                <span
                  className={`text-lg ${
                    price.change_pct >= 0 ? 'positive' : 'negative'
                  }`}
                >
                  {price.change_pct >= 0 ? '+' : ''}
                  {formatPrice(price.change_pct)}%
                </span>
              )}
              {price.change !== undefined && (
                <span
                  className={`text-sm ${
                    price.change >= 0 ? 'positive' : 'negative'
                  }`}
                >
                  {price.change >= 0 ? '+' : ''}
                  {formatPrice(price.change)}
                </span>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="종목코드 (e.g., AAPL)"
            className="px-3 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent] w-40"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[--accent] hover:bg-[--accent-hover] rounded-lg transition-colors"
          >
            검색
          </button>
        </form>
      </div>

      {/* Period buttons */}
      <div className="flex gap-1 mb-4">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePeriodChange(p.value)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              period === p.value
                ? 'bg-[--accent] text-white'
                : 'bg-[--bg-card] text-[--text-secondary] hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 bg-[--bg-card] rounded-xl border border-[--border] overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-[--text-secondary]">
            Loading...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-400">
            {error}
          </div>
        ) : (
          <div ref={chartContainerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
