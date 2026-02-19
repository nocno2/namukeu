import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time, HistogramData, LineData } from 'lightweight-charts';
import { stocksApi } from '../api/client';

// Technical indicators
interface IndicatorData {
  ma?: LineData[];
  volume?: HistogramData[];
  rsi?: LineData[];
  macd?: { macd: LineData; signal: LineData; histogram: HistogramData[] };
}

const periods = [
  { label: '1분', value: '1m' },
  { label: '5분', value: '5m' },
  { label: '15분', value: '15m' },
  { label: '30분', value: '30m' },
  { label: '1시간', value: '1h' },
  { label: '4시간', value: '4h' },
  { label: '1일', value: '1d' },
  { label: '1주', value: '1wk' },
  { label: '1개월', value: '1mo' },
];

const chartTypes = [
  { label: '캔들', value: 'candle', icon: '🕯' },
  { label: '라인', value: 'line', icon: '📈' },
  { label: '산형', value: 'area', icon: '⛰' },
  { label: '바', value: 'bar', icon: '📊' },
];

const indicators = [
  { label: 'MA', value: 'ma' },
  { label: '볼륨', value: 'volume' },
  { label: 'RSI', value: 'rsi' },
  { label: 'MACD', value: 'macd' },
];

export default function Chart() {
  const [searchParams] = useSearchParams();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const signalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const histogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [symbol, setSymbol] = useState(searchParams.get('symbol') || 'AAPL');
  const [searchInput, setSearchInput] = useState(symbol);
  const [price, setPrice] = useState<any>(null);
  const [period, setPeriod] = useState('1y');
  const [chartType, setChartType] = useState('candle');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['volume']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Initialize main chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#58a6ff',
          width: 1,
          style: 2,
          labelBackgroundColor: '#58a6ff',
        },
        horzLine: {
          color: '#58a6ff',
          width: 1,
          style: 2,
          labelBackgroundColor: '#58a6ff',
        },
      },
      rightPriceScale: {
        borderColor: '#30363d',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { axisPressedMouseMove: true },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

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

  // Create series based on chart type
  const createSeries = useCallback(() => {
    if (!chartRef.current) return;

    // Remove existing series
    if (candlestickSeriesRef.current) {
      chartRef.current.removeSeries(candlestickSeriesRef.current);
      candlestickSeriesRef.current = null;
    }
    if (maSeriesRef.current) {
      chartRef.current.removeSeries(maSeriesRef.current);
      maSeriesRef.current = null;
    }

    // Create series based on type
    switch (chartType) {
      case 'candle':
        const candleSeries = chartRef.current.addSeries(CandlestickSeries, {
          upColor: '#3fb950',
          downColor: '#f85149',
          borderUpColor: '#3fb950',
          borderDownColor: '#f85149',
          wickUpColor: '#3fb950',
          wickDownColor: '#f85149',
        });
        candlestickSeriesRef.current = candleSeries;
        break;
      case 'line':
        const lineSeries = chartRef.current.addSeries(LineSeries, {
          color: '#58a6ff',
          lineWidth: 2,
          priceLineVisible: false,
        });
        candlestickSeriesRef.current = lineSeries as any;
        break;
      case 'area':
        const areaSeries = chartRef.current.addSeries(AreaSeries, {
          lineColor: '#58a6ff',
          topColor: 'rgba(88, 166, 255, 0.4)',
          bottomColor: 'rgba(88, 166, 255, 0.0)',
          lineWidth: 2,
          priceLineVisible: false,
        });
        candlestickSeriesRef.current = areaSeries as any;
        break;
    }

    // Add MA if active
    if (activeIndicators.includes('ma')) {
      const maSeries = chartRef.current.addSeries(LineSeries, {
        color: '#d29922',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      maSeriesRef.current = maSeries;
    }
  }, [chartType, activeIndicators]);

  // Create volume sub-chart
  useEffect(() => {
    if (!volumeContainerRef.current) return;

    const chart = createChart(volumeContainerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#30363d', scaleMargins: { top: 0.1, bottom: 0 } },
      timeScale: { visible: false, borderColor: '#30363d' },
      height: 80,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#58a6ff',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
    });

    volumeSeriesRef.current = volumeSeries;
    chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        chart.timeScale().setVisibleLogicalRange(range);
      }
    });

    return () => {
      chart.remove();
    };
  }, []);

  // Create RSI sub-chart
  useEffect(() => {
    if (!activeIndicators.includes('rsi')) {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
      return;
    }

    if (!rsiContainerRef.current) return;

    const chart = createChart(rsiContainerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#30363d',
        scaleMargins: { top: 0.1, bottom: 0 },
      },
      timeScale: { visible: false, borderColor: '#30363d' },
      height: 100,
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#a371f7',
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat: { type: 'percent' },
    });

    // Add overbought/oversold lines
    chart.addSeries(LineSeries, {
      color: '#f85149',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }).setData([
      { time: '2020-01-01' as Time, value: 70 },
      { time: '2030-01-01' as Time, value: 70 },
    ]);

    chart.addSeries(LineSeries, {
      color: '#3fb950',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }).setData([
      { time: '2020-01-01' as Time, value: 30 },
      { time: '2030-01-01' as Time, value: 30 },
    ]);

    rsiChartRef.current = chart;
    rsiSeriesRef.current = rsiSeries;

    chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        chart.timeScale().setVisibleLogicalRange(range);
      }
    });

    return () => {
      chart.remove();
    };
  }, [activeIndicators]);

  // Create MACD sub-chart
  useEffect(() => {
    if (!activeIndicators.includes('macd')) {
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
      }
      return;
    }

    // RSI container에 MACD도 같이 표시
  }, [activeIndicators]);

  // Initialize series
  useEffect(() => {
    createSeries();
  }, [createSeries]);

  // Fetch data
  const fetchData = async (sym: string, periodValue: string) => {
    setLoading(true);
    setError('');

    try {
      const [priceRes, historyRes] = await Promise.all([
        stocksApi.getPrice(sym),
        stocksApi.getHistory(sym, periodValue),
      ]);

      setPrice(priceRes.data);

      const history = historyRes.data;
      if (!history || history.length === 0) {
        setError('데이터가 없습니다');
        setLoading(false);
        return;
      }

      // Process data
      const candleData: CandlestickData[] = history.map((item: any) => ({
        time: item.date.split('T')[0] as Time,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }));

      const lineData: LineData[] = history.map((item: any) => ({
        time: item.date.split('T')[0] as Time,
        value: item.close,
      }));

      // Volume data
      const volumeData: HistogramData[] = history.map((item: any) => ({
        time: item.date.split('T')[0] as Time,
        value: item.volume,
        color: item.close >= item.open ? 'rgba(63, 185, 80, 0.5)' : 'rgba(248, 81, 73, 0.5)',
      }));

      // MA data (20-day)
      const maData: LineData[] = [];
      for (let i = 19; i < history.length; i++) {
        const sum = history.slice(i - 19, i + 1).reduce((a: number, b: any) => a + b.close, 0);
        maData.push({
          time: history[i].date.split('T')[0] as Time,
          value: sum / 20,
        });
      }

      // RSI data (14-day)
      const rsiData: LineData[] = [];
      for (let i = 14; i < history.length; i++) {
        const gains: number[] = [];
        const losses: number[] = [];
        for (let j = i - 13; j <= i; j++) {
          const change = history[j].close - history[j - 1]?.close || 0;
          if (change > 0) gains.push(change);
          else losses.push(Math.abs(change));
        }
        const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
        const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / 14 : 0;
        const rs = avgLoss ? avgGain / avgLoss : 100;
        const rsi = 100 - (100 / (1 + rs));
        rsiData.push({
          time: history[i].date.split('T')[0] as Time,
          value: rsi,
        });
      }

      // Update main chart
      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(chartType === 'candle' ? candleData : lineData);
      }
      if (maSeriesRef.current) {
        maSeriesRef.current.setData(maData);
      }
      chartRef.current?.timeScale().fitContent();

      // Update volume
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(volumeData);
      }

      // Update RSI
      if (rsiSeriesRef.current) {
        rsiSeriesRef.current.setData(rsiData);
      }

    } catch (err: any) {
      console.error('Chart error:', err);
      setError(err.response?.data?.detail || '차트 데이터를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSymbol(searchInput.toUpperCase().trim());
      fetchData(searchInput.toUpperCase().trim(), period);
      setShowSearch(false);
    }
  };

  const toggleIndicator = (indicator: string) => {
    setActiveIndicators(prev =>
      prev.includes(indicator)
        ? prev.filter(i => i !== indicator)
        : [...prev, indicator]
    );
  };

  const formatPrice = (num: number | undefined) => {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  return (
    <div className="h-screen flex flex-col bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
        {/* Symbol Search */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="relative">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSearch(!showSearch)}
                className="text-lg font-bold text-[#f0f6fc] hover:text-[#58a6ff] transition-colors"
              >
                {symbol}
              </button>
              {showSearch && (
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(e as any)}
                  placeholder="종목코드"
                  className="w-24 px-2 py-1 bg-[#21262d] border border-[#30363d] rounded text-sm text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff]"
                  autoFocus
                />
              )}
            </div>
          </form>
          <div className="flex flex-col">
            <span className="text-xl font-bold text-[#f0f6fc]">
              ${formatPrice(price?.price)}
            </span>
            <span className={`text-xs font-medium ${(price?.change_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {(price?.change_pct || 0) >= 0 ? '+' : ''}{formatPrice(price?.change_pct)}%
            </span>
          </div>
        </div>

        {/* Chart Type */}
        <div className="flex items-center gap-1 bg-[#21262d] rounded-lg p-1">
          {chartTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => setChartType(type.value)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                chartType === type.value
                  ? 'bg-[#58a6ff] text-white'
                  : 'text-[#8b949e] hover:text-[#f0f6fc]'
              }`}
              title={type.label}
            >
              {type.icon}
            </button>
          ))}
        </div>

        {/* Period */}
        <div className="flex items-center gap-1 bg-[#21262d] rounded-lg p-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-[#58a6ff] text-white'
                  : 'text-[#8b949e] hover:text-[#f0f6fc]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1">
          {indicators.map((ind) => (
            <button
              key={ind.value}
              onClick={() => toggleIndicator(ind.value)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                activeIndicators.includes(ind.value)
                  ? 'bg-[#a371f7] text-white'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]'
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
              <div className="text-[#8b949e]">Loading...</div>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-[#f85149]">
            {error}
          </div>
        ) : (
          <>
            {/* Main Chart */}
            <div ref={chartContainerRef} className="flex-1" />

            {/* Volume Chart */}
            {activeIndicators.includes('volume') && (
              <div ref={volumeContainerRef} className="h-20 border-t border-[#21262d]" />
            )}

            {/* RSI Chart */}
            {activeIndicators.includes('rsi') && (
              <div className="h-[100px] border-t border-[#21262d]">
                <div className="px-2 py-1 text-xs text-[#8b949e]">RSI (14)</div>
                <div ref={rsiContainerRef} className="h-[80px]" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
